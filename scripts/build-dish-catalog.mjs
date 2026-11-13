import { resolve } from 'node:path'
import { dataDir, readJson, readWeeks, writeJson } from './lib/data-files.mjs'
import { normalizeIngredients, sortByChinese, variantIdFor } from './lib/variant.mjs'

/**
 * 从 weeks/*.json（唯一事实源）全量重建两个派生文件：
 *
 * 1. dish-catalog.json —— 菜名 → 多种配方变体（variantId 内容寻址）
 *    顶层 ingredients / riskAllergens 取「主变体」（出现次数最多的那版），
 *    保证前端 TraceDialog 零改动；同名多配方时标 needsReview 供人工复核。
 * 2. ingredient-index.json —— 食材 → 命中记录（菜名 + 变体 + 日期 + 餐次）
 *
 * 全量重建，不继承旧文件：旧目录里的并集脏数据（豆沙卷、豆奶等）不会累积。
 * 人工字段（aliases / substitute / verified）从 dish-meta.json 读取，永不从周文件推导。
 * 冗余字段一律不落盘：week 由 date 可推、mealLabel 由 mealPeriod 可推。
 */
const catalogPath = resolve(dataDir, 'dish-catalog.json')
const indexFilePath = resolve(dataDir, 'ingredient-index.json')
const metaPath = resolve(dataDir, 'dish-meta.json')
const aliasesPath = resolve(dataDir, 'ingredient-aliases.json')

const weeks = await readWeeks()
if (weeks.length === 0) {
  throw new Error('没有找到 public/assets/data/weeks/*.json，先运行 npm run split')
}

const meta = await readJson(metaPath).catch(() => ({ dishes: {} }))
const aliasGroups = await readJson(aliasesPath).catch(() => ({ groups: {} }))

/** 写法 → 规范名。未登记的写法就是自己的规范名。 */
const canonicalOf = new Map()
for (const [canonical, forms] of Object.entries(aliasGroups.groups ?? {})) {
  for (const form of Array.isArray(forms) ? forms : []) {
    const key = String(form).trim()
    if (key) canonicalOf.set(key, canonical)
  }
}
const canonicalName = (ingredient) => canonicalOf.get(ingredient) ?? ingredient

const dishes = new Map()
const ingredientHits = new Map()
const conflicts = []
const updatedAt = weeks[weeks.length - 1].updatedAt ?? new Date().toISOString()

for (const week of weeks) {
  for (const entry of week.recipes) {
    for (const dish of entry.dishes ?? []) {
      const name = String(dish.name ?? '').trim()
      if (!name) continue

      const ingredients = normalizeIngredients(dish.ingredients ?? [])
      if (ingredients.length === 0) continue

      const variantId = dish.variantId ?? variantIdFor(name, ingredients)
      const riskAllergens = [...new Set(dish.riskAllergens ?? [])].sort()
      const sourceImage = typeof entry.sourceImage === 'string' ? entry.sourceImage : ''

      if (!dishes.has(name)) dishes.set(name, { name, variants: new Map() })
      const record = dishes.get(name)
      if (!record.variants.has(variantId)) {
        record.variants.set(variantId, {
          variantId,
          ingredients,
          riskAllergens,
          dates: [],
          sourceImages: [],
        })
      }

      const variant = record.variants.get(variantId)
      // 同一 variantId 下食材/过敏原必须一致，否则说明哈希口径被破坏。
      if (variant.ingredients.join('|') !== ingredients.join('|')) {
        conflicts.push({
          dish: name,
          variantId,
          field: 'ingredients',
          was: variant.ingredients,
          now: ingredients,
        })
      }
      if (variant.riskAllergens.join('|') !== riskAllergens.join('|')) {
        conflicts.push({
          dish: name,
          variantId,
          field: 'riskAllergens',
          was: variant.riskAllergens,
          now: riskAllergens,
        })
      }

      const duplicate = variant.dates.some(
        (item) => item.date === entry.date && item.mealPeriod === entry.mealPeriod,
      )
      if (!duplicate) {
        variant.dates.push({ date: entry.date, mealPeriod: entry.mealPeriod })
      }
      if (sourceImage && !variant.sourceImages.includes(sourceImage)) {
        variant.sourceImages.push(sourceImage)
      }

      for (const ingredient of ingredients) {
        const canonical = canonicalName(ingredient)
        if (!ingredientHits.has(canonical)) ingredientHits.set(canonical, [])
        ingredientHits.get(canonical).push({
          // form 只在写法与规范名不同时落盘，避免重复。
          ...(ingredient === canonical ? {} : { form: ingredient }),
          dish: name,
          variantId,
          date: entry.date,
          mealPeriod: entry.mealPeriod,
        })
      }
    }
  }
}

const catalogDishes = {}

for (const name of sortByChinese([...dishes.keys()])) {
  const record = dishes.get(name)
  const manual = meta.dishes?.[name] ?? {}

  const variants = [...record.variants.values()]
    .map((variant) => {
      const dates = variant.dates.map((item) => item.date).sort()
      return {
        variantId: variant.variantId,
        ingredients: variant.ingredients,
        riskAllergens: variant.riskAllergens,
        count: variant.dates.length,
        firstSeen: dates[0] ?? '',
        lastSeen: dates[dates.length - 1] ?? '',
      }
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.firstSeen < right.firstSeen ? -1 : left.firstSeen > right.firstSeen ? 1 : 0),
    )

  // occurrences 只在顶层存一份，带 variantId 指回配方；mealLabel 由前端按 mealPeriod 渲染。
  const occurrences = record.variants.size
    ? [...record.variants.values()]
        .flatMap((variant) =>
          variant.dates.map((item) => ({
            date: item.date,
            mealPeriod: item.mealPeriod,
            variantId: variant.variantId,
          })),
        )
        .sort((left, right) =>
          left.date !== right.date
            ? left.date < right.date
              ? -1
              : 1
            : left.mealPeriod.localeCompare(right.mealPeriod),
        )
    : []

  const dates = occurrences.map((item) => item.date)
  const primary = variants[0]
  const manualSubstitute =
    typeof manual.substitute === 'string' && manual.substitute.trim()
      ? manual.substitute.trim()
      : null

  const entry = {
    name,
    aliases: Array.isArray(manual.aliases) ? manual.aliases : [],
    // 主变体：出现次数最多，并列取最早出现的那版。
    ingredients: primary?.ingredients ?? [],
    riskAllergens: primary?.riskAllergens ?? [],
    substitute: manualSubstitute,
    firstSeen: dates[0] ?? '',
    lastSeen: dates[dates.length - 1] ?? '',
    occurrences,
    sourceImages: sortByChinese([
      ...new Set([...record.variants.values()].flatMap((variant) => variant.sourceImages)),
    ]),
    variants,
    ...(variants.length > 1 ? { needsReview: true } : {}),
    ...(typeof manual.verified === 'boolean' ? { verified: manual.verified } : {}),
  }

  catalogDishes[name] = entry
}

const ingredients = {}
for (const name of sortByChinese([...ingredientHits.keys()])) {
  const hits = ingredientHits.get(name).sort((left, right) =>
    left.date !== right.date ? (left.date < right.date ? -1 : 1) : left.dish.localeCompare(right.dish, 'zh-CN'),
  )
  const dates = [...new Set(hits.map((hit) => hit.date))].sort()
  const dishNames = sortByChinese([...new Set(hits.map((hit) => hit.dish))])
  const forms = sortByChinese([...new Set(hits.map((hit) => hit.form ?? name))])

  ingredients[name] = {
    forms,
    dishCount: dishNames.length,
    hitCount: hits.length,
    firstSeen: dates[0] ?? '',
    lastSeen: dates[dates.length - 1] ?? '',
    dishes: dishNames,
    hits,
  }
}

await writeJson(catalogPath, { updatedAt, dishes: catalogDishes })
await writeJson(indexFilePath, {
  updatedAt,
  note: '食材索引：按规范食材名聚合；hits 指回菜名与变体，form 只在写法与规范名不同时出现。',
  total: {
    ingredients: Object.keys(ingredients).length,
    hits: Object.values(ingredients).reduce((total, item) => total + item.hitCount, 0),
    dishes: Object.keys(catalogDishes).length,
    variants: Object.values(catalogDishes).reduce((total, dish) => total + dish.variants.length, 0),
  },
  ingredients,
})

const reviewCount = Object.values(catalogDishes).filter((dish) => dish.needsReview).length
console.log(
  `[leleat] catalog: ${Object.keys(catalogDishes).length} dishes / ${
    Object.values(catalogDishes).reduce((total, dish) => total + dish.variants.length, 0)
  } variants (${reviewCount} 同名多配方), ${Object.keys(ingredients).length} ingredients`,
)
if (conflicts.length > 0) {
  console.warn('[leleat] 变体口径冲突，请检查 variantId 生成逻辑：')
  for (const conflict of conflicts) console.warn('  ', JSON.stringify(conflict))
  process.exitCode = 1
}
