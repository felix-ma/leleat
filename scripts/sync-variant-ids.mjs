import { resolve } from 'node:path'
import { dataDir, readJson, readWeeks, writeJson } from './lib/data-files.mjs'
import { normalizeIngredients, variantIdFor } from './lib/variant.mjs'

/**
 * 同步 weeks/*.json 里的 dish.variantId。
 *
 * variantId 是派生字段（不是原表信息）：口径是「规范菜名 + 排序后食材」内容寻址。
 * dish-meta.json 的 aliases 把同一道菜的其它写法（香米饭/水晶米饭 → 米饭）归并到规范名后，
 * 变体标识会变，需要重算一次，否则前端按 dish.variantId 回查 catalog 变体会对不上。
 *
 * 只改 variantId，不动 dish.name / ingredients / riskAllergens 等原表数据。
 */
const metaPath = resolve(dataDir, 'dish-meta.json')
const meta = await readJson(metaPath).catch(() => ({ dishes: {} }))

const canonicalOf = new Map()
for (const [canonical, manual] of Object.entries(meta.dishes ?? {})) {
  for (const alias of Array.isArray(manual.aliases) ? manual.aliases : []) {
    const key = String(alias).trim()
    if (key) canonicalOf.set(key, canonical)
  }
}
const canonicalDishName = (name) => canonicalOf.get(name) ?? name

const weeks = await readWeeks()
let changed = 0
let scanned = 0

for (const week of weeks) {
  let weekChanged = false
  for (const entry of week.recipes) {
    for (const dish of entry.dishes ?? []) {
      scanned += 1
      const name = String(dish.name ?? '').trim()
      if (!name) continue
      const ingredients = normalizeIngredients(dish.ingredients ?? [])
      if (ingredients.length === 0) continue
      const expected = variantIdFor(canonicalDishName(name), ingredients)
      if (dish.variantId !== expected) {
        dish.variantId = expected
        changed += 1
        weekChanged = true
      }
    }
  }
  if (weekChanged) {
    // 保留周文件原有字段顺序与 updatedAt，只回写 recipes。
    await writeJson(resolve(dataDir, 'weeks', `${week.week}.json`), {
      week: week.week,
      startDate: week.startDate,
      endDate: week.endDate,
      ...(week.updatedAt ? { updatedAt: week.updatedAt } : {}),
      recipes: week.recipes,
    })
  }
}

console.log(`[leleat] sync-variants: 扫描 ${scanned} 道菜，更新 ${changed} 个 variantId`)
