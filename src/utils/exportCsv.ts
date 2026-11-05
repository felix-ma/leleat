import type { ExportRow } from '../types'
import { downloadBlob } from './download'

const HEADERS = ['日期', '餐次', '菜品', '风险过敏原', '推荐替餐'] as const

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function exportCsv(rows: ExportRow[], fileBase: string): void {
  const lines = [
    HEADERS.map(escapeCsvField).join(','),
    ...rows.map((row) =>
      [row.date, row.mealLabel, row.dishName, row.riskNames, row.substitute]
        .map(escapeCsvField)
        .join(','),
    ),
  ]

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  })

  downloadBlob(blob, `${fileBase}.csv`)
}
