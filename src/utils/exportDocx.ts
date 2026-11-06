import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  PageBreak,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  Tab,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { MEAL_LABELS, MEAL_ORDER, type MealPeriod, type MenuDay, type MenuMeal } from '../types'
import { downloadBlob } from './download'
import {
  addDays,
  formatWeekNumber,
  formatWeekRange,
  isoWeekForDate,
  isoWeekStart,
  parseIsoDate,
  toIsoDate,
} from './date'

/** 微软雅黑在 Windows / WPS / 手机 Word 上都有，比宋体在小字号下更清楚。 */
const FONT = '微软雅黑'
const RED = 'FF0000'
const BLACK = '000000'
// 横向 A4 可用宽度：16838 - 2 × 283 = 16272 twips，铺满整页。
const TABLE_WIDTH = 15926
const LABEL_WIDTH = 900
// docx 会按 orientation 交换宽高；这里填入 A4 的短边/长边，
// 生成结果才是 16838 × 11906 的横向页面。
const A4_SHORT_EDGE = 11906
const A4_LONG_EDGE = 16838
const PAGE_MARGIN_X = 454
const PAGE_MARGIN_Y = 510
// 与打印版一致：1px 深灰边框、浅灰表头、更浅的餐次列。
const BORDER = { style: BorderStyle.SINGLE, size: 6, color: '666666' }
const HEAD_FILL = 'F1F1F1'
const LABEL_FILL = 'F7F7F7'
const MUTED = '555555'
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const

interface WeekColumn {
  date: string
  weekday: string
  shortDate: string
}

interface WeekMealRow {
  period: MealPeriod
  label: string
}

interface WeekBlock {
  week: string
  columns: WeekColumn[]
  meals: WeekMealRow[]
  dayMap: Map<string, MenuDay>
  rangeLabel: string
}

export interface DocxExportOptions {
  days: MenuDay[]
  rangeStart: string
  rangeEnd: string
  supplements: string[]
  title: string
  rangeLabel: string
  fileBase: string
  schoolName?: string
  updatedAt?: string
}

function textRun(
  text: string,
  options: { size?: number; bold?: boolean; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: options.size ?? 21,
    bold: options.bold ?? false,
    color: options.color ?? BLACK,
  })
}

function paragraph(
  text: string,
  options: {
    size?: number
    bold?: boolean
    color?: string
    after?: number
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: exactLine(options.size ?? 21, options.after ?? 0),
    children: [textRun(text, options)],
  })
}

function cellMargins(): { top: number; bottom: number; left: number; right: number } {
  // 与打印版 padding: 2.6mm 1.5mm 对齐（147 / 85 twips）
  return { top: 130, bottom: 130, left: 85, right: 85 }
}

/** 补剂表只用于勾选，边距压到最小。 */
function compactCellMargins(): { top: number; bottom: number; left: number; right: number } {
  // 与打印版 padding: 0.7mm 1mm 对齐（40 / 57 twips）
  return { top: 40, bottom: 40, left: 57, right: 57 }
}

/** 固定行距：Word 与 LibreOffice 对「单倍行距」的解释随字体不同，固定行高才能保证两边排版一致。 */
function exactLine(size: number, after = 0, before = 0) {
  return { before, after, line: Math.round(size * 14.4), lineRule: LineRuleType.EXACT }
}


function borderSet(): {
  top: typeof BORDER
  bottom: typeof BORDER
  left: typeof BORDER
  right: typeof BORDER
  insideHorizontal: typeof BORDER
  insideVertical: typeof BORDER
} {
  return {
    top: BORDER,
    bottom: BORDER,
    left: BORDER,
    right: BORDER,
    insideHorizontal: BORDER,
    insideVertical: BORDER,
  }
}

function longWeekday(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return ''
  return WEEKDAY_NAMES[date.getUTCDay()]
}

function shortDate(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return isoDate
  // 与打印版一致：11/9，不补前导零
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

function buildWeekBlocks(options: DocxExportOptions): WeekBlock[] {
  const sortedDays = [...options.days].sort((left, right) => left.date.localeCompare(right.date))
  const groups = new Map<string, MenuDay[]>()

  for (const day of sortedDays) {
    const week = isoWeekForDate(day.date)
    if (!week) continue
    const bucket = groups.get(week)
    if (bucket) {
      bucket.push(day)
    } else {
      groups.set(week, [day])
    }
  }

  const fallbackStart = sortedDays[0]?.date ?? options.rangeStart
  const fallbackEnd = sortedDays[sortedDays.length - 1]?.date ?? options.rangeEnd
  const rangeStart = parseIsoDate(options.rangeStart) ? options.rangeStart : fallbackStart
  const rangeEnd = parseIsoDate(options.rangeEnd) ? options.rangeEnd : fallbackEnd

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([week, weekDays]) => {
      const dayMap = new Map(weekDays.map((day) => [day.date, day]))
      const monday = isoWeekStart(week)
      if (!monday) return null

      const dataDates = new Set(dayMap.keys())
      const dates: string[] = []

      for (let offset = 0; offset < 5; offset += 1) {
        const date = addDays(toIsoDate(monday), offset)
        if (date && date >= rangeStart && date <= rangeEnd) dates.push(date)
      }

      for (const date of dataDates) {
        if (!dates.includes(date) && date >= rangeStart && date <= rangeEnd) dates.push(date)
      }

      dates.sort()
      if (dates.length === 0) return null

      const columns: WeekColumn[] = dates.map((date) => ({
        date,
        weekday: longWeekday(date),
        shortDate: shortDate(date),
      }))

      const mealMap = new Map<MealPeriod, string>()
      for (const day of weekDays) {
        for (const meal of day.meals) {
          if (!mealMap.has(meal.mealPeriod)) {
            mealMap.set(meal.mealPeriod, meal.mealLabel || MEAL_LABELS[meal.mealPeriod])
          }
        }
      }

      const meals = [...mealMap.entries()]
        .map(([period, label]) => ({ period, label }))
        .sort((left, right) => MEAL_ORDER[left.period] - MEAL_ORDER[right.period])

      const firstDate = columns[0].date
      const lastDate = columns[columns.length - 1].date

      return {
        week,
        columns,
        meals,
        dayMap,
        rangeLabel: formatWeekRange(firstDate, lastDate),
      }
    })
    .filter((block): block is WeekBlock => block !== null)
}


function noBorders() {
  return {
    top: NO_BORDER,
    bottom: NO_BORDER,
    left: NO_BORDER,
    right: NO_BORDER,
    insideHorizontal: NO_BORDER,
    insideVertical: NO_BORDER,
  }
}

/** 页首：左侧小字+大标题，右侧两行 meta，下方一条横线。只用段落 + 右对齐制表位，
 *  避免嵌套表格在 Word 里被额外撑高（那会让整份文档溢出到第二页）。 */
function buildPrintHeader(block: WeekBlock, options: DocxExportOptions): Paragraph[] {
  // 与打印版一致：周一到周日的完整区间 + 「第 N 周」
  const monday = isoWeekStart(block.week)
  const mondayIso = monday ? toIsoDate(monday) : null
  const sundayIso = mondayIso ? addDays(mondayIso, 6) : null
  const range = mondayIso && sundayIso ? formatWeekRange(mondayIso, sundayIso) : options.rangeLabel
  const meta = [`${range} · ${formatWeekNumber(block.week)}`]
  if (options.updatedAt) meta.push(`数据更新：${options.updatedAt}`)
  const tabStops = [{ type: TabStopType.RIGHT, position: TABLE_WIDTH }]
  const tab = () => new TextRun({ children: [new Tab()], size: 16 })

  return [
    new Paragraph({
      tabStops,
      spacing: exactLine(16, 0),
      children: [
        textRun(`${options.schoolName || 'Leleat'} · 周食谱`, { size: 16, color: MUTED }),
        tab(),
        textRun(meta[0] || '', { size: 16, color: MUTED }),
      ],
    }),
    new Paragraph({
      tabStops,
      spacing: exactLine(38, 30),
      children: [textRun(options.title, { size: 38, bold: true }), tab(), textRun(meta[1] || '', { size: 16, color: MUTED })],
    }),
    new Paragraph({
      spacing: exactLine(2, 60),
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '777777', space: 2 } },
      children: [textRun('', { size: 2 })],
    }),
  ]
}

/** 补剂区标题：左侧标题 + 右侧小字，用制表位对齐打印版。 */
function buildSupplementHeading(): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TABLE_WIDTH }],
    spacing: exactLine(20, 30, 80),
    children: [
      textRun('每日补剂（周一至周日，逐日勾选）', { size: 20, bold: true }),
      new TextRun({ children: [new Tab()], size: 14 }),
      textRun('一周 5 天食谱 · 7 天补剂', { size: 16, color: '666666' }),
    ],
  })
}

function buildHeaderCell(column: WeekColumn, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: cellMargins(),
    shading: { fill: HEAD_FILL },
    children: [
      paragraph(column.weekday, { bold: true, size: 21 }),
      paragraph(column.shortDate, { size: 16, color: MUTED }),
    ],
  })
}

function buildDishParagraph(dish: MenuMeal['dishes'][number]): Paragraph {
  const hasRisk = dish.riskAllergens.length > 0
  const runs: TextRun[] = [
    textRun(dish.name, {
      size: 21,
      bold: hasRisk,
      color: hasRisk ? RED : BLACK,
    }),
  ]

  if (hasRisk && dish.recommendation[0]) {
    runs.push(
      textRun(`（替：${dish.recommendation[0]}）`, {
        size: 21,
        bold: true,
        color: RED,
      }),
    )
  }

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 50, line: 270 },
    children: runs,
  })
}

function buildMealCell(meal: MenuMeal | undefined, width: number): TableCell {
  const children =
    meal && meal.dishes.length > 0
      ? meal.dishes.map((dish) => buildDishParagraph(dish))
      : [paragraph('—', { size: 20, color: '777777' })]

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: cellMargins(),
    children,
  })
}

function buildMenuTable(block: WeekBlock): Table {
  const dayWidth = Math.floor((TABLE_WIDTH - LABEL_WIDTH) / block.columns.length)

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: LABEL_WIDTH, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMargins(),
        shading: { fill: HEAD_FILL },
        children: [paragraph('餐次', { bold: true, size: 21 })],
      }),
      ...block.columns.map((column) => buildHeaderCell(column, dayWidth)),
    ],
  })

  const mealRows = block.meals.map((mealRow) => {
    const cells: TableCell[] = [
      new TableCell({
        width: { size: LABEL_WIDTH, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMargins(),
        shading: { fill: LABEL_FILL },
        children: [paragraph(mealRow.label, { bold: true, size: 21 })],
      }),
    ]

    for (const column of block.columns) {
      const day = block.dayMap.get(column.date)
      const meal = day?.meals.find((candidate) => candidate.mealPeriod === mealRow.period)
      cells.push(buildMealCell(meal, dayWidth))
    }

    return new TableRow({
      cantSplit: true,
      children: cells,
    })
  })

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_WIDTH, ...block.columns.map(() => dayWidth)],
    layout: TableLayoutType.FIXED,
    borders: borderSet(),
    rows: [header, ...mealRows],
  })
}

function buildSupplementTable(block: WeekBlock, supplements: string[]): Table {
  const labelWidth = 1600
  const monday = isoWeekStart(block.week)
  const supplementDates =
    monday === null
      ? []
      : Array.from({ length: 7 }, (_, index) => addDays(toIsoDate(monday), index)).filter(
          (date): date is string => date !== null,
        )
  const dayWidth = Math.floor((TABLE_WIDTH - labelWidth) / supplementDates.length)

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: labelWidth, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: compactCellMargins(),
        shading: { fill: HEAD_FILL },
        children: [paragraph('补剂', { bold: true, size: 16 })],
      }),
      ...supplementDates.map(
        (date) =>
          new TableCell({
            width: { size: dayWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: compactCellMargins(),
            shading: { fill: HEAD_FILL },
            children: [
              paragraph(longWeekday(date), { bold: true, size: 16 }),
              paragraph(shortDate(date), { size: 16, color: MUTED }),
            ],
          }),
      ),
    ],
  })

  const itemRows = supplements.map(
    (supplement) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: labelWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: compactCellMargins(),
            children: [paragraph(supplement, { size: 16, bold: true })],
          }),
          ...supplementDates.map(
            () =>
              new TableCell({
                width: { size: dayWidth, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                margins: compactCellMargins(),
                children: [paragraph('□', { size: 20 })],
              }),
          ),
        ],
      }),
  )

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [labelWidth, ...supplementDates.map(() => dayWidth)],
    layout: TableLayoutType.FIXED,
    borders: borderSet(),
    rows: [header, ...itemRows],
  })
}

function buildWeekContent(
  block: WeekBlock,
  options: DocxExportOptions,
): (Paragraph | Table)[] {
  return [
    ...buildPrintHeader(block, options),
    buildMenuTable(block),
    new Paragraph({ spacing: exactLine(2, 0, 10), children: [textRun('', { size: 2 })] }),
    buildSupplementHeading(),
    buildSupplementTable(block, options.supplements),
    new Paragraph({
      spacing: exactLine(18, 0, 170),
      children: [
        textRun(
          '说明：红色为含登记过敏原的菜品，括号内为已确认替餐；未标注替餐的请与幼儿园确认。补剂请在对应日期勾选。',
          { size: 18, color: '555555' },
        ),
      ],
    }),
  ]
}

export function buildWeeklyMenuDocument(options: DocxExportOptions): Document {
  const blocks = buildWeekBlocks(options)
  const children: (Paragraph | Table)[] = []

  if (blocks.length === 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [textRun(options.title, { size: 28, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [textRun(options.rangeLabel, { size: 17, color: '666666' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [textRun('所选范围没有可导出的食谱。', { size: 21, color: '555555' })],
      }),
    )
  } else {
    blocks.forEach((block, index) => {
      if (index > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }))
      }
      children.push(...buildWeekContent(block, options))
    })
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 21 },
          paragraph: { spacing: { line: 240 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_SHORT_EDGE,
              height: A4_LONG_EDGE,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: PAGE_MARGIN_Y,
              right: PAGE_MARGIN_X,
              bottom: PAGE_MARGIN_Y,
              left: PAGE_MARGIN_X,
            },
          },
        },
        children,
      },
    ],
  })
}

export async function exportDocx(options: DocxExportOptions): Promise<void> {
  const document = buildWeeklyMenuDocument(options)
  const blob = await Packer.toBlob(document)
  downloadBlob(blob, `${options.fileBase}.docx`)
}
