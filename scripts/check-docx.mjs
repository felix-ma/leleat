#!/usr/bin/env node
/**
 * 用 LibreOffice 实测导出的 Word 是否只占一页（比按 XML 估算可靠）。
 *
 *   node scripts/check-docx.mjs path/to/leleat-2026-W46.docx
 *
 * 需要本机有 `soffice`（apt install libreoffice-writer）。输出页数；页数 > 1 时退出码为 1。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/check-docx.mjs <file.docx>')
  process.exit(2)
}

const out = mkdtempSync(join(tmpdir(), 'docx-check-'))
try {
  execFileSync(
    'soffice',
    ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', out, file],
    { stdio: 'ignore', timeout: 180_000 },
  )
  const pdf = join(out, basename(file).replace(/\.docx$/i, '.pdf'))
  const bytes = readFileSync(pdf)
  const text = bytes.toString('latin1')
  // 页树里每个页面对象都带 /Type /Page（注意 /Pages 是父节点）
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  console.log(`${basename(file)}: ${pages} page(s)`)
  process.exit(pages === 1 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
