#!/usr/bin/env node
/**
 * 估算导出的 Word（.docx）在 A4 横向一页里占多高，用来判断会不会溢出到第二页。
 *
 *   node scripts/measure-docx-height.mjs path/to/leleat-2026-W46.docx
 *
 * 公式来自对 6 个真实样本的标定（见文件末尾说明）。输出：
 *   content  估算内容高度（mm）
 *   page     可用高度（A4 横向 210mm − 上下页边距）
 *   verdict  OK / TIGHT / OVERFLOW
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const TWIP_MM = 25.4 / 1440
const HALF_PT = 0.5
/** Word 里单倍行距约为字号的 1.32 倍（微软雅黑实测）。 */
const LINE_FACTOR = 1.32
/** 一页可用高度（A4 横向 210mm 减上下各 5mm 页边距）。 */
const PAGE_MM = 200

function readXml(file) {
  const buf = readFileSync(file)
  // 最小 zip 读取：遍历 local file header，取出 word/document.xml
  let offset = 0
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break
    const method = buf.readUInt16LE(offset + 8)
    const compSize = buf.readUInt32LE(offset + 18)
    const nameLen = buf.readUInt16LE(offset + 26)
    const extraLen = buf.readUInt16LE(offset + 28)
    const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen)
    const dataStart = offset + 30 + nameLen + extraLen
    if (name === 'word/document.xml') {
      const raw = buf.subarray(dataStart, dataStart + compSize)
      return method === 0 ? raw.toString('utf8') : inflateRawSync(raw).toString('utf8')
    }
    offset = dataStart + compSize
  }
  throw new Error('word/document.xml not found')
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : undefined
}
const num = (tag, name, fallback = 0) => {
  const v = attr(tag, name)
  return v === undefined ? fallback : Number(v)
}

/** 一行文字在给定宽度（twips）里会折成几行：全角按 1 字宽，半角按 0.55。 */
function visualLines(text, sizeHalfPt, widthTwips) {
  const widthMm = widthTwips * TWIP_MM
  const fontSizeMm = sizeHalfPt * HALF_PT * 25.4 / 72
  if (fontSizeMm <= 0) return 1
  let units = 0
  for (const ch of text) units += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55
  const capacity = Math.max(1, widthMm / fontSizeMm)
  return Math.max(1, Math.ceil(units / capacity))
}

/** 段落高度（pt）：行数 × 行高 + 段前段后。 */
function paragraphHeight(inner, widthTwips) {
  const spacing = inner.match(/<w:spacing[^/]*\/>/)?.[0] ?? ''
  const after = num(spacing, 'w:after') / 20
  const before = num(spacing, 'w:before') / 20
  const line = num(spacing, 'w:line', 240)
  let size = 21
  const texts = [...inner.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1])
  let chars = 0
  for (const run of texts) {
    const sz = num(run.match(/<w:sz [^/]*\/>/)?.[0] ?? '', 'w:val', 21)
    size = Math.max(size === 21 ? 0 : size, sz)
    const t = run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/)?.[1] ?? ''
    chars += t.length
  }
  if (size === 0) size = 21
  const lines = Math.max(1, visualLines('x'.repeat(chars), size, widthTwips))
  const linePt = LINE_FACTOR * size * HALF_PT * (line / 240)
  return lines * linePt + before + after
}

function rowCells(row, grid) {
  const cells = [...row.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1])
  let index = 0
  return cells.map((cell) => {
    const tcPr = cell.match(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/)?.[1] ?? ''
    const span = num(tcPr.match(/<w:gridSpan[^/]*\/>/)?.[0] ?? '', 'w:val', 1)
    const width = grid.slice(index, index + span).reduce((a, b) => a + b, 0)
    index += span
    const mar = tcPr.match(/<w:tcMar>([\s\S]*?)<\/w:tcMar>/)?.[1] ?? ''
    const padding =
      ['top', 'bottom'].reduce((sum, side) => {
        const m = mar.match(new RegExp(`<w:${side} [^/]*/>`))?.[0] ?? ''
        return sum + num(m, 'w:w') / 20
      }, 0) *
      25.4 /
      72
    const body = cell.replace(/<w:tcPr>[\s\S]*?<\/w:tcPr>/, '')
    const paragraphs = [...body.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((m) => m[0])
    const content = paragraphs.reduce((sum, p) => sum + paragraphHeight(p, width), 0)
    return { content: content * (25.4 / 72) + padding }
  })
}

function tableHeight(tableXml) {
  const grid = [...(tableXml.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/)?.[1] ?? '').matchAll(/w:w="(\d+)"/g)].map(
    (m) => Number(m[1]),
  )
  const rows = [...tableXml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0])
  let total = 0
  for (const row of rows) {
    const trPr = row.match(/<w:trPr>([\s\S]*?)<\/w:trPr>/)?.[1] ?? ''
    const height = num(trPr.match(/<w:trHeight[^/]*\/>/)?.[0] ?? '', 'w:val') * 0.0176
    total += Math.max(height, ...rowCells(row, grid).map((c) => c.content))
  }
  return total
}

/** 顶层元素顺序高度（段落 + 表格）。 */
export function measureDocx(file) {
  const xml = readXml(file)
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? ''
  // 先把所有表格抠掉，剩下的按段落算，最后按出现顺序累加
  const parts = []
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p>[\s\S]*?<\/w:p>/g
  let m
  while ((m = re.exec(body))) parts.push(m[0])
  const pageWidth = 16272
  let mm = 0
  for (const part of parts) {
    if (part.startsWith('<w:tbl>')) mm += tableHeight(part)
    else mm += paragraphHeight(part, pageWidth) * (25.4 / 72)
  }
  const content = Math.round(mm * 10) / 10
  const verdict = content > PAGE_MM ? 'OVERFLOW' : content > (PAGE_MM * 0.97) ? 'TIGHT' : 'OK'
  return { content, page: PAGE_MM, verdict }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/measure-docx-height.mjs <file.docx>')
    process.exit(1)
  }
  const r = measureDocx(file)
  console.log(`content ${r.content}mm / page ${r.page}mm → ${r.verdict}`)
  process.exit(r.verdict === 'OVERFLOW' ? 1 : 0)
}

/**
 * 标定说明（样本：11863 原始版、edd3687、e9d55d9、353653f、8751c35、ce5e1e2 六份真实导出）：
 * - 纯段落 + 普通表格的文档，本估算与 Word 实际高度相差 5% 以内；
 * - 页首用「嵌套表格」时 Word 会额外加高，估算偏低，已改为段落 + 右对齐制表位实现；
 * - 因此判定阈值取 97%：content ≤ 194mm 视为单页，194–200mm 可能溢出，>200mm 一定溢出。
 */
