import {
  AlignmentType,
  BorderStyle,
  Document,
  PageBreak,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { MEAL_LABELS, MEAL_ORDER, type MealPeriod, type MenuDay, type MenuMeal } from '../types'
import { downloadBlob } from './download'
import {
  addDays,
  formatWeekRange,
  isoWeekForDate,
  isoWeekStart,
  parseIsoDate,
  toIsoDate,
} from './date'

const FONT = '宋体'
const RED = 'FF0000'
const BLACK = '000000'
const TABLE_WIDTH = 16000
const LABEL_WIDTH = 900
// docx 会按 orientation 交换宽高；这里填入 A4 的短边/长边，
// 生成结果才是 16838 × 11906 的横向页面。
const A4_SHORT_EDGE = 11906
const A4_LONG_EDGE = 16838
const PAGE_MARGIN = 283
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
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
  title: string
  rangeLabel: string
  fileBase: string
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
    spacing: { after: options.after ?? 0, line: 240 },
    children: [textRun(text, options)],
  })
}

function cellMargins(): { top: number; bottom: number; left: number; right: number } {
  return { top: 60, bottom: 60, left: 55, right: 55 }
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
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`
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

function buildHeaderCell(column: WeekColumn, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: cellMargins(),
    children: [
      paragraph(column.weekday, { bold: true, size: 20 }),
      paragraph(column.shortDate, { size: 15, color: '555555' }),
    ],
  })
}

function buildDishParagraph(dish: MenuMeal['dishes'][number]): Paragraph {
  const hasRisk = dish.riskAllergens.length > 0
  const runs: TextRun[] = [
    textRun(dish.name, {
      size: hasRisk ? 20 : 21,
      bold: hasRisk,
      color: hasRisk ? RED : BLACK,
    }),
  ]

  if (hasRisk) {
    const replacement = dish.recommendation[0] ?? '待确认'
    runs.push(
      textRun(`（${replacement}）`, {
        size: 17,
        bold: true,
        color: RED,
      }),
    )
  }

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 35, line: 235 },
    children: runs,
  })
}

function buildMealCell(meal: MenuMeal | undefined, width: number): TableCell {
  const children =
    meal && meal.dishes.length > 0
      ? meal.dishes.map((dish) => buildDishParagraph(dish))
      : [paragraph('—', { size: 18, color: '777777' })]

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
        children: [paragraph('餐次', { bold: true, size: 20 })],
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
        children: [paragraph(mealRow.label, { bold: true, size: 19 })],
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

function buildSupplementTable(block: WeekBlock): Table {
  const labelWidth = 1400
  const dayWidth = Math.floor((TABLE_WIDTH - labelWidth) / block.columns.length)

  const cells: TableCell[] = [
    new TableCell({
      width: { size: labelWidth, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: cellMargins(),
      children: [paragraph('每日补剂', { bold: true, size: 18 })],
    }),
  ]

  for (const column of block.columns) {
    cells.push(
      new TableCell({
        width: { size: dayWidth, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMargins(),
        children: [
          paragraph(`${column.weekday} ${column.shortDate}`, { size: 14, color: '555555', after: 20 }),
          paragraph('□ AD   □ VD', { size: 15, after: 10 }),
          paragraph('□ 五维口服液', { size: 15, after: 10 }),
          paragraph('□ 益生菌', { size: 15 }),
        ],
      }),
    )
  }

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [labelWidth, ...block.columns.map(() => dayWidth)],
    layout: TableLayoutType.FIXED,
    borders: borderSet(),
    rows: [new TableRow({ cantSplit: true, children: cells })],
  })
}

function buildWeekContent(block: WeekBlock, title: string): (Paragraph | Table)[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 45, line: 240 },
      children: [textRun(title, { size: 28, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120, line: 240 },
      children: [
        textRun(`${block.rangeLabel} · ${block.week}`, { size: 17, color: '444444' }),
        textRun('  ·  红色为含过敏原菜品，括号内为首选替餐', { size: 17, color: '8A3A34' }),
      ],
    }),
    buildMenuTable(block),
    new Paragraph({ spacing: { after: 120 } }),
    buildSupplementTable(block),
    new Paragraph({
      spacing: { before: 80, line: 240 },
      children: [
        textRun(
          '说明：红色菜品含登记过敏原；括号内为首选替餐，请与幼儿园确认后使用。',
          { size: 15, color: '666666' },
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
      children.push(...buildWeekContent(block, options.title))
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
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
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
