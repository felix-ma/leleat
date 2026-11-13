import { resolve } from 'node:path'
import { dataDir, readJson, readWeeks, writeJson } from './lib/data-files.mjs'
import { normalizeIngredients, sortByChinese, variantIdFor } from './lib/variant.mjs'

/**
 * 从 weeks/*.json（唯一事实源）全量重建两个派生文件：
 *
 * 1. dish-catalog.json —— 菜名 → 多种配方变体（variantId 内容寻址）
 *    顶层 ingredients / riskAllergens 取「主配方」：默认最近一次出现的那版
 *    （dish-meta.json reviewPolicy.mode，可切回 frequency），保证前端 TraceDialog 零改动；
 *    历史配方全部保留在 variants[]，未定口径时才标 needsReview 供人工复核。
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

/**
 * 同名多配方的主配方口径，来自 dish-meta.json 顶层 reviewPolicy：
 * - mode: 'latest'（默认）每次重建都取「最近一次出现」的那版作主配方；
 *   'frequency' 退回旧口径（出现次数最多），并保留 needsReview 供人工复核。
 * 无论哪种口径，variants[] 与 weeks/ 里的每次出现都原样保留。
 */
const reviewPolicy = { mode: meta.reviewPolicy?.mode === 'frequency' ? 'frequency' : 'latest' }

/** 写法 → 规范名。未登记的写法就是自己的规范名。 */
const canonicalOf = new Map()
for (const [canonical, forms] of Object.entries(aliasGroups.groups ?? {})) {
  for (const form of Array.isArray(forms) ? forms : []) {
    const key = String(form).trim()
    if (key) canonicalOf.set(key, canonical)
  }
}
const canonicalName = (ingredient) => canonicalOf.get(ingredient) ?? ingredient

/**
 * 菜名写法 → 规范菜名。人工在 dish-meta.json 的 aliases 里登记「同一道菜的其它写法」
 * （如 香米饭/水晶米饭 → 米饭），catalog 只按规范名聚合成一条。
 * weeks/ 里的 dish.name 保持原表写法不变，因此这里只做派生层的归并。
 */
const dishCanonicalOf = new Map()
for (const [canonical, manual] of Object.entries(meta.dishes ?? {})) {
  for (const alias of Array.isArray(manual.aliases) ? manual.aliases : []) {
    const key = String(alias).trim()
    if (key) dishCanonicalOf.set(key, canonical)
  }
}
const canonicalDishName = (name) => dishCanonicalOf.get(name) ?? name

const dishes = new Map()
const ingredientHits = new Map()
const conflicts = []
const updatedAt = weeks[weeks.length - 1].updatedAt ?? new Date().toISOString()

for (const week of weeks) {
  for (const entry of week.recipes) {
    for (const dish of entry.dishes ?? []) {
      const name = String(dish.name ?? '').trim()
      if (!name) continue
      const canonicalDish = canonicalDishName(name)

      const ingredients = normalizeIngredients(dish.ingredients ?? [])
      if (ingredients.length === 0) continue

      // 变体仍按「规范菜名 + 排序后食材」内容寻址：别名归并后，
      // 香米饭/水晶米饭/米饭 的 [大米] 会并成同一条变体，而不是各算一版。
      const variantId = variantIdFor(canonicalDish, ingredients)
      const riskAllergens = [...new Set(dish.riskAllergens ?? [])].sort()
      const sourceImage = typeof entry.sourceImage === 'string' ? entry.sourceImage : ''

      if (!dishes.has(canonicalDish)) dishes.set(canonicalDish, { name: canonicalDish, variants: new Map() })
      const record = dishes.get(canonicalDish)
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
          dish: canonicalDish,
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

  // 变体数组按出现次数降序；并列时取最近出现的在前（便于人工复核时第一眼看到新配方）。
  const variants = [...record.variants.values()]
    .map((variant) => {
      const variantDates = variant.dates.map((item) => item.date).sort()
      return {
        variantId: variant.variantId,
        ingredients: variant.ingredients,
        riskAllergens: variant.riskAllergens,
        count: variant.dates.length,
        firstSeen: variantDates[0] ?? '',
        lastSeen: variantDates[variantDates.length - 1] ?? '',
      }
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.lastSeen > right.lastSeen ? -1 : left.lastSeen < right.lastSeen ? 1 : 0),
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

  // 主配方选择：dish-meta 里显式钉住的 > 复核策略（默认「以最新一次为准」）> 出现次数最多。
  const variantById = new Map(variants.map((variant) => [variant.variantId, variant]))
  const latestVariantId = occurrences.length
    ? occurrences[occurrences.length - 1].variantId
    : undefined
  const manualPrimary =
    typeof manual.primaryVariant === 'string' && variantById.has(manual.primaryVariant)
      ? manual.primaryVariant
      : undefined

  let primaryBasis = 'frequency'
  let primaryVariantId = variants[0]?.variantId
  if (manualPrimary) {
    primaryBasis = 'manual'
    primaryVariantId = manualPrimary
  } else if (reviewPolicy.mode === 'latest' && latestVariantId) {
    primaryBasis = 'latest'
    primaryVariantId = latestVariantId
  }
  const primary = primaryVariantId ? variantById.get(primaryVariantId) : undefined

  const manualSubstitute =
    typeof manual.substitute === 'string' && manual.substitute.trim()
      ? manual.substitute.trim()
      : null

  const entry = {
    name,
    aliases: Array.isArray(manual.aliases) ? manual.aliases : [],
    // 主配方：默认取最近一次出现的那版；历史配方全在 variants[] 里，不丢。
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
    ...(primaryVariantId ? { primaryVariantId } : {}),
    primaryBasis,
    // 多配方但还没定口径时才需要人工复核；已按策略定过的不再重复提示。
    ...(variants.length > 1 && primaryBasis === 'frequency' ? { needsReview: true } : {}),
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

const multiVariantCount = Object.values(catalogDishes).filter(
  (dish) => dish.variants.length > 1,
).length
const reviewCount = Object.values(catalogDishes).filter((dish) => dish.needsReview).length
console.log(
  `[leleat] catalog: ${Object.keys(catalogDishes).length} dishes / ${
    Object.values(catalogDishes).reduce((total, dish) => total + dish.variants.length, 0)
  } variants (${multiVariantCount} 同名多配方, ${reviewCount} 待复核), ${
    Object.keys(ingredients).length
  } ingredients`,
)
if (multiVariantCount > 0 && reviewCount === 0) {
  console.log('[leleat] 主配方口径：以最近一次出现为准（dish-meta.json reviewPolicy.mode=latest）')
}
if (conflicts.length > 0) {
  console.warn('[leleat] 变体口径冲突，请检查 variantId 生成逻辑：')
  for (const conflict of conflicts) console.warn('  ', JSON.stringify(conflict))
  process.exitCode = 1
}
