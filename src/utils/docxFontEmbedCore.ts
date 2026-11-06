import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * OOXML 字体嵌入的纯函数实现（不依赖 DOM，方便在 node 里验证）。
 *
 * Word 只能按字体名去系统里找字体，网页字体它看不到；要真正锁定字形只能走
 * 字体嵌入：word/fonts/*.odttf + word/fontTable.xml 的 w:embedRegular +
 * word/settings.xml 的 w:embedTrueTypeFonts。嵌入字体按 MS-DOCX 规范做
 * 「前 32 字节与 GUID 逆序异或」的混淆。
 */
const FONT_PART = 'word/fonts/font1.odttf'
const FONT_REL_ID = 'rIdLeleatFont'
export const FONT_KEY = '{8C1B7A4E-3D2F-4A6B-9E5C-2F7D4B1A9C30}'
const FONT_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.obfuscatedFont'
const FONT_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const OBFUSCATION_KEY = (() => {
  const hex = FONT_KEY.replace(/[{}-]/g, '')
  const key = new Uint8Array(16)
  for (let i = 0; i < 16; i += 1) key[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return key
})()

export function obfuscateFont(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice()
  const head = Math.min(32, out.length)
  for (let i = 0; i < head; i += 1) out[i] ^= OBFUSCATION_KEY[15 - (i % 16)]
  return out
}

function patchContentTypes(xml: string): string {
  if (xml.includes('Extension="odttf"')) return xml
  return xml.replace('</Types>', `<Default Extension="odttf" ContentType="${FONT_CONTENT_TYPE}"/></Types>`)
}

function patchFontTable(xml: string, fontName: string): string {
  const embed = `<w:embedRegular r:id="${FONT_REL_ID}" w:fontKey="${FONT_KEY}" w:subsetted="true"/>`
  let next = xml
  if (!next.includes('xmlns:r=')) {
    next = next.replace('<w:fonts ', `<w:fonts xmlns:r="${R_NS}" `)
  }

  const entry = new RegExp(`<w:font w:name="${fontName}">[\\s\\S]*?</w:font>`)
  if (entry.test(next)) {
    return next.replace(entry, (block) =>
      block.includes('w:embedRegular') ? block : block.replace('</w:font>', `${embed}</w:font>`),
    )
  }

  const font = `<w:font w:name="${fontName}"><w:charset w:val="86"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>${embed}</w:font>`
  // docx 库默认输出空的自闭合 <w:fonts .../>，需要先展开再插入
  if (/<w:fonts[^>]*\/>/.test(next)) {
    return next.replace(/<w:fonts([^>]*)\/>/, `<w:fonts$1>${font}</w:fonts>`)
  }
  return next.replace('</w:fonts>', `${font}</w:fonts>`)
}

function patchFontTableRels(xml: string | undefined): string {
  const rel = `<Relationship Id="${FONT_REL_ID}" Type="${FONT_REL_TYPE}" Target="fonts/font1.odttf"/>`
  if (!xml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`
  }
  if (xml.includes(FONT_REL_ID)) return xml
  if (/<Relationships[^>]*\/>/.test(xml)) {
    return xml.replace(/<Relationships([^>]*)\/>/, `<Relationships$1>${rel}</Relationships>`)
  }
  return xml.replace('</Relationships>', `${rel}</Relationships>`)
}

function patchSettings(xml: string): string {
  if (xml.includes('w:embedTrueTypeFonts')) return xml
  return xml.replace(/(<w:settings[^>]*>)/, '$1<w:embedTrueTypeFonts/><w:embedSystemFonts/>')
}

/** 把字体塞进 docx 的 zip 结构，返回新的 docx 字节。 */
export function embedFontIntoDocx(
  docx: Uint8Array,
  fontBytes: Uint8Array,
  fontName: string,
): Uint8Array {
  const files = unzipSync(docx)
  const decode = (name: string): string | undefined => (files[name] ? strFromU8(files[name]) : undefined)

  const rewrite = (name: string, transform: (xml: string) => string) => {
    const xml = decode(name)
    if (xml) files[name] = strToU8(transform(xml))
  }

  rewrite('[Content_Types].xml', patchContentTypes)
  rewrite('word/fontTable.xml', (xml) => patchFontTable(xml, fontName))
  rewrite('word/settings.xml', patchSettings)
  files['word/_rels/fontTable.xml.rels'] = strToU8(patchFontTableRels(decode('word/_rels/fontTable.xml.rels')))
  files[FONT_PART] = obfuscateFont(fontBytes)

  return zipSync(files, { level: 6 })
}
