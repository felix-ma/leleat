/**
 * Node 侧的日期工具。逻辑与 src/utils/date.ts 的 ISO 周计算保持一致，
 * 脚本不能 import 前端 TS，因此这里保持一份最小实现；两边改动需同步。
 */
const ISO_WEEK_RE = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/
const pad = (value) => String(value).padStart(2, '0')

export function toIsoDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function isoWeekForDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null

  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const year = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${year}-W${pad(week)}`
}

export function isoWeekStart(week) {
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

export function isoWeekEnd(week) {
  const monday = isoWeekStart(week)
  if (!monday) return null

  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return sunday
}
