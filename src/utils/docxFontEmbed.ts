import fontUrl from '../assets/fonts/docx-embed.ttf?url'
import { embedFontIntoDocx } from './docxFontEmbedCore'

/** 与字体文件内 Name 表一致的家族名，docx 里所有 run 都用它。 */
export const EMBED_FONT_NAME = 'Noto Sans SC'

let cachedFont: Promise<Uint8Array> | null = null

function loadFont(): Promise<Uint8Array> {
  cachedFont ??= fetch(fontUrl).then(async (response) => {
    if (!response.ok) throw new Error(`font ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  })
  return cachedFont
}

/** 用嵌入字体重写 docx；任何失败都退回原始文件，导出流程不中断。 */
export async function embedDocxFont(blob: Blob): Promise<Blob> {
  try {
    const [fontBytes, source] = await Promise.all([loadFont(), blob.arrayBuffer()])
    const output = embedFontIntoDocx(new Uint8Array(source), fontBytes, EMBED_FONT_NAME)
    return new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  } catch {
    return blob
  }
}
