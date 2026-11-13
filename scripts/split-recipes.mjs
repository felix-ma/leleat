import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { dataDir, readJson, sortEntries, uniqueDates, weeksDir, writeJson } from './lib/data-files.mjs'
import { variantIdFor } from './lib/variant.mjs'
import { isoWeekEnd, isoWeekStart, toIsoDate } from './lib/date.mjs'

/**
 * 一次性迁移：把单体 recipes.json 按 ISO 周拆成 public/assets/data/weeks/YYYY-Www.json，
 * 并生成 index.json（周清单 + 每周日期，供前端在不加载全部周文件的前提下建周选项）。
 *
 * 幂等：重复执行按周文件重新覆盖，不读取旧周文件内容做合并（周文件是事实源，不是缓存）。
 */
const recipesPath = resolve(dataDir, 'recipes.json')
const indexPath = resolve(dataDir, 'index.json')

const document = await readJson(recipesPath)
const recipes = Array.isArray(document) ? document : document.recipes
const updatedAt = Array.isArray(document)
  ? new Date().toISOString()
  : document.updatedAt ?? new Date().toISOString()

const byWeek = new Map()
for (const entry of recipes) {
  const week = String(entry.week ?? '')
  if (!week) throw new Error(`食谱条目 ${entry.date} 缺少 week 字段`)
  const bucket = byWeek.get(week) ?? []
  bucket.push(entry)
  byWeek.set(week, bucket)
}

await mkdir(weeksDir, { recursive: true })

const weekEntries = []
for (const [week, entries] of [...byWeek.entries()].sort()) {
  const sortedEntries = sortEntries(entries).map((entry) => ({
    ...entry,
    dishes: entry.dishes.map((dish) => ({
      ...dish,
      variantId: variantIdFor(dish.name, dish.ingredients),
    })),
  }))

  const start = isoWeekStart(week)
  const end = isoWeekEnd(week)
  const document = {
    week,
    startDate: start ? toIsoDate(start) : '',
    endDate: end ? toIsoDate(end) : '',
    updatedAt,
    recipes: sortedEntries,
  }

  await writeJson(resolve(weeksDir, `${week}.json`), document)
  weekEntries.push({
    week,
    startDate: document.startDate,
    endDate: document.endDate,
    file: `weeks/${week}.json`,
    dates: uniqueDates(sortedEntries),
    meals: sortedEntries.length,
    dishes: sortedEntries.reduce((total, entry) => total + entry.dishes.length, 0),
  })
}

const dates = weekEntries.flatMap((week) => week.dates).sort()

await writeJson(indexPath, {
  updatedAt,
  weeks: weekEntries,
  range: { startDate: dates[0] ?? '', endDate: dates[dates.length - 1] ?? '' },
  total: {
    weeks: weekEntries.length,
    dates: dates.length,
    meals: weekEntries.reduce((total, week) => total + week.meals, 0),
    dishes: weekEntries.reduce((total, week) => total + week.dishes, 0),
  },
})

// 周文件成为唯一事实源后删除单体文件，避免两份数据各自漂移。
await rm(recipesPath, { force: true })

console.log(
  `[leleat] split: ${weekEntries.length} weeks, ${dates.length} days -> ${weeksDir}`,
)
