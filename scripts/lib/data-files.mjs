import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
export const dataDir = resolve(root, 'public/assets/data')
export const weeksDir = resolve(dataDir, 'weeks')

export const MEAL_ORDER = ['breakfast', 'morningSnack', 'lunch', 'afternoonTea', 'dinner']

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/** 稳定排序：日期升序，同一天按餐次顺序。 */
export function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) return left.date < right.date ? -1 : 1
    return MEAL_ORDER.indexOf(left.mealPeriod) - MEAL_ORDER.indexOf(right.mealPeriod)
  })
}

/**
 * 读取全部周文件，返回按周排序的 `{ week, startDate, endDate, recipes }` 列表。
 * 周文件是唯一事实源；`recipes.json` 只作为一次性迁移输入，不再参与运行时。
 */
export async function readWeeks() {
  let files
  try {
    files = await readdir(weeksDir)
  } catch {
    return []
  }

  const weeks = []
  for (const fileName of files.filter((name) => name.endsWith('.json')).sort()) {
    const document = await readJson(resolve(weeksDir, fileName))
    const week = String(document.week ?? fileName.replace(/\.json$/, ''))
    weeks.push({
      week,
      startDate: document.startDate ?? '',
      endDate: document.endDate ?? '',
      updatedAt: document.updatedAt,
      recipes: Array.isArray(document.recipes) ? document.recipes : [],
    })
  }
  return weeks.sort((left, right) => (left.week < right.week ? -1 : 1))
}

export function uniqueDates(recipes) {
  return [...new Set(recipes.map((entry) => entry.date))].sort()
}
