const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_WEEK_RE = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

const pad = (value: number): string => String(value).padStart(2, '0')

export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE_RE.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDays(isoDate: string, amount: number): string | null {
  const date = parseIsoDate(isoDate)
  if (!date) return null

  date.setUTCDate(date.getUTCDate() + amount)
  return toIsoDate(date)
}

export function isIsoWeek(value: string): boolean {
  return ISO_WEEK_RE.test(value) && isoWeekStart(value) !== null
}

export function isoWeekForDate(isoDate: string): string | null {
  const date = parseIsoDate(isoDate)
  if (!date) return null

  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const year = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${year}-W${pad(week)}`
}

export function isoWeekStart(week: string): Date | null {
  const match = ISO_WEEK_RE.exec(week)
  if (!match) return null

  const year = Number(match[1])
  const weekNumber = Number(match[2])
  const januaryFourth = new Date(Date.UTC(year, 0, 4))
  const mondayOffset = (januaryFourth.getUTCDay() + 6) % 7
  const monday = new Date(januaryFourth)
  monday.setUTCDate(januaryFourth.getUTCDate() - mondayOffset + (weekNumber - 1) * 7)

  if (isoWeekForDate(toIsoDate(monday)) !== week) return null
  return monday
}

export function isoWeekEnd(week: string): Date | null {
  const monday = isoWeekStart(week)
  if (!monday) return null

  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return sunday
}

export function formatWeekRange(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (!start || !end) return `${startDate} – ${endDate}`

  const startYear = start.getUTCFullYear()
  const endYear = end.getUTCFullYear()
  const startMonth = start.getUTCMonth() + 1
  const endMonth = end.getUTCMonth() + 1
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startYear}年${startMonth}月${startDay}日 – ${endDay}日`
    }
    return `${startYear}年${startMonth}月${startDay}日 – ${endMonth}月${endDay}日`
  }

  return `${startYear}年${startMonth}月${startDay}日 – ${endYear}年${endMonth}月${endDay}日`
}

export function formatWeekRangeShort(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (!start || !end) return `${startDate} – ${endDate}`

  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCMonth() + 1}月${start.getUTCDate()}日 – ${end.getUTCDate()}日`
  }

  return `${start.getUTCMonth() + 1}月${start.getUTCDate()}日 – ${end.getUTCMonth() + 1}月${end.getUTCDate()}日`
}

export function formatDayHeading(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return isoDate
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}

export function weekdayLabel(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return ''
  return WEEKDAYS[date.getUTCDay()]
}

export function formatUpdatedAt(value?: string): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatWeekNumber(week: string): string {
  const match = ISO_WEEK_RE.exec(week)
  if (!match) return week
  return `第 ${Number(match[2])} 周`
}

export function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right)
}

export function weekdayLong(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return ''
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getUTCDay()]
}

export function todayIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function startOfWeek(isoDate: string): string | null {
  const week = isoWeekForDate(isoDate)
  if (!week) return null
  const monday = isoWeekStart(week)
  return monday ? toIsoDate(monday) : null
}

export function weekDates(isoDate: string): string[] {
  const monday = startOfWeek(isoDate)
  if (!monday) return []

  return Array.from({ length: 7 }, (_, index) => addDays(monday, index)).filter(
    (date): date is string => date !== null,
  )
}

export function formatDayLong(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return isoDate
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${weekdayLong(isoDate)}`
}

export function formatMonthDay(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (!date) return isoDate
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}
