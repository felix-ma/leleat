import {
  MEAL_LABELS,
  MEAL_ORDER,
  type Allergen,
  type DishCategory,
  type ExportRow,
  type MenuDay,
  type MenuDish,
  type MealPeriod,
  type MenuMeal,
  type RecipeEntry,
  type SubstituteLibrary,
  type SubstituteRecipe,
  type SubstituteSource,
  type SubstitutesMap,
  type WeekOption,
} from '../types'
import { resolveAssetUrl } from './assets'
import {
  compareIsoDates,
  formatDayHeading,
  formatWeekRange,
  formatWeekRangeShort,
  isoWeekEnd,
  isoWeekStart,
  toIsoDate,
  weekdayLabel,
} from './date'

export function createWeekOptions(recipes: RecipeEntry[]): WeekOption[] {
  const weeks = [...new Set(recipes.map((entry) => entry.week))]
    .filter((week) => isoWeekStart(week) !== null)
    .sort()

  return weeks.map((week) => {
    const start = isoWeekStart(week)
    const end = isoWeekEnd(week)
    const startDate = start ? toIsoDate(start) : ''
    const endDate = end ? toIsoDate(end) : ''

    return {
      week,
      startDate,
      endDate,
      label: formatWeekRange(startDate, endDate),
      shortLabel: formatWeekRangeShort(startDate, endDate),
    }
  })
}

export function getWeekEntries(recipes: RecipeEntry[], week: string): RecipeEntry[] {
  return recipes.filter((entry) => entry.week === week)
}

export function filterEntriesByDateRange(
  recipes: RecipeEntry[],
  startDate: string,
  endDate: string,
): RecipeEntry[] {
  return recipes.filter((entry) => entry.date >= startDate && entry.date <= endDate)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function allergenNameFor(id: string, allergenMap: Map<string, Allergen>): string {
  return allergenMap.get(id)?.name ?? id
}

export function getAllergenNames(ids: string[], allergens: Allergen[]): string[] {
  const allergenMap = new Map(allergens.map((allergen) => [allergen.id, allergen]))
  return uniqueStrings(ids.map((id) => allergenNameFor(id, allergenMap)))
}

const DRINK_HINTS = ['牛奶', '酸牛奶', '豆奶', '豆浆', '米奶', '椰奶', '燕麦奶', '果汁', '奶昔', '豆乳']
const FRUIT_HINTS = [
  '苹果', '香蕉', '梨', '橘子', '蜜橘', '橙', '圣女果', '哈密瓜', '蜜瓜', '火龙果',
  '葡萄', '西瓜', '桃', '李', '柚', '莓', '猕猴桃', '龙眼', '荔枝', '枇杷', '提子',
]
const STAPLE_HINTS = [
  '粥', '面', '粉', '馒头', '包', '糕', '饭', '饼', '卷', '饺', '烧麦', '云吞',
  '馄饨', '玉米', '红薯', '紫薯', '山药', '意面', '汤圆',
]
const SNACK_HINTS = ['山楂', '葡萄干', '饼干', '薯片', '坚果', '果干']

/**
 * 推断菜品品类，用于给替餐加「同品类」约束：
 * 早餐的鸡蛋不能换成一道菜，主食也不能换成菜。
 */
export function inferDishCategory(
  dish: { name: string; ingredients: string[] },
  mealPeriod: MealPeriod,
): DishCategory {
  const name = dish.name
  if (DRINK_HINTS.some((hint) => name.includes(hint))) return '饮品'
  if (name.trim().endsWith('汤')) return '汤'
  if (
    FRUIT_HINTS.some((hint) => name.includes(hint)) &&
    !STAPLE_HINTS.some((hint) => name.includes(hint))
  ) {
    return '水果'
  }
  if (STAPLE_HINTS.some((hint) => name.includes(hint))) return '主食'
  const eggOnly = dish.ingredients.length > 0 && dish.ingredients.every((item) => item.includes('蛋'))
  if ((name.includes('蛋') || eggOnly) && mealPeriod !== 'lunch' && mealPeriod !== 'dinner') {
    return '蛋白'
  }
  if (SNACK_HINTS.some((hint) => name.includes(hint))) return '点心'
  return '菜'
}

interface RecommendationContext {
  /** 整周共用的用量计数：同一个替餐这一周用过几次。 */
  usedCounts: Map<string, number>
  /** 同一餐里已有的菜名，避免替餐和本餐其它菜重复。 */
  mealDishNames: Set<string>
  mealPeriod: MealPeriod
  category: DishCategory
}

function scoreCandidate(
  recipe: SubstituteRecipe,
  dishName: string,
  context: RecommendationContext,
): number {
  const exactMatch = recipe.usedFor?.includes(dishName) ? 500 : 0
  const verified = recipe.verified ? 100 : 0
  const categoryBoost = recipe.categories?.includes(context.category) ? 200 : 0
  const usedPenalty = (context.usedCounts.get(recipe.id) ?? 0) * 1000
  const duplicatePenalty = context.mealDishNames.has(recipe.name) ? 20000 : 0
  // 同类收尾（面→面、粥→粥）降低一点分数，换点花样。
  const similarPenalty =
    dishName.length > 0 && recipe.name.slice(-1) === dishName.slice(-1) ? 60 : 0
  return (
    exactMatch +
    verified +
    categoryBoost +
    (recipe.priority ?? 0) -
    usedPenalty -
    duplicatePenalty -
    similarPenalty
  )
}

function inMealPeriod(recipe: SubstituteRecipe, mealPeriod: MealPeriod): boolean {
  return !recipe.mealPeriods?.length || recipe.mealPeriods.includes(mealPeriod)
}

function inCategory(recipe: SubstituteRecipe, category: DishCategory): boolean {
  return !recipe.categories?.length || recipe.categories.includes(category)
}

function getRecommendation(
  dish: RecipeEntry['dishes'][number],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
  library: SubstituteRecipe[],
  context: RecommendationContext,
): {
  recommendation: string[]
  source: SubstituteSource
  substituteId?: string
  tags: string[]
} {
  const custom = typeof dish.substitute === 'string' ? dish.substitute.trim() : ''
  if (custom) {
    return { recommendation: [custom], source: 'dish', tags: [] }
  }

  if (dish.riskAllergens.length === 0) {
    return { recommendation: [], source: 'none', tags: [] }
  }

  const allSatisfied = library.filter((recipe) =>
    dish.riskAllergens.every((id) => recipe.replaces.includes(id)),
  )

  // 从严格到宽松依次尝试，保证「品类对得上」优先，实在没有才放宽。
  const tiers = [
    allSatisfied.filter(
      (recipe) =>
        inMealPeriod(recipe, context.mealPeriod) && inCategory(recipe, context.category),
    ),
    allSatisfied.filter((recipe) => inMealPeriod(recipe, context.mealPeriod)),
    allSatisfied.filter((recipe) => inCategory(recipe, context.category)),
    allSatisfied,
  ]

  const candidates = (tiers.find((tier) => tier.length > 0) ?? [])
    .map((recipe) => ({ recipe, score: scoreCandidate(recipe, dish.name, context) }))
    .sort((left, right) => right.score - left.score)

  if (candidates.length > 0) {
    const chosen = candidates[0].recipe
    context.usedCounts.set(chosen.id, (context.usedCounts.get(chosen.id) ?? 0) + 1)
    return {
      recommendation: [chosen.name],
      source: 'library',
      substituteId: chosen.id,
      tags: chosen.tags,
    }
  }

  const allergenMap = new Map(allergens.map((allergen) => [allergen.id, allergen]))
  const recommendation: string[] = []

  for (const id of dish.riskAllergens) {
    const name = allergenNameFor(id, allergenMap)
    // 旧版替餐表作为回退，兼容尚未迁移到替餐库的数据。
    const options = substitutes[name] ?? substitutes[id] ?? []
    recommendation.push(...options)
  }

  const deduped = uniqueStrings(recommendation)
  return {
    recommendation: deduped,
    source: deduped.length > 0 ? 'library' : 'none',
    tags: [],
  }
}

function enrichDish(
  dish: RecipeEntry['dishes'][number],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
  library: SubstituteRecipe[],
  context: RecommendationContext,
): MenuDish {
  const { recommendation, source, substituteId, tags } = getRecommendation(
    dish,
    allergens,
    substitutes,
    library,
    context,
  )

  return {
    ...dish,
    allergenNames: getAllergenNames(dish.riskAllergens, allergens),
    recommendation,
    substituteSource: source,
    substituteTags: tags,
    ...(substituteId ? { substituteId } : {}),
  }
}

export function buildMenuDays(
  entries: RecipeEntry[],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
  substituteLibrary: SubstituteLibrary = { recipes: [] },
): MenuDay[] {
  const mealBuckets = new Map<string, RecipeEntry[]>()
  // 整周共用，保证同一周内替餐不重复。
  const usedCounts = new Map<string, number>()

  for (const entry of entries) {
    const key = `${entry.date}__${entry.mealPeriod}`
    const bucket = mealBuckets.get(key)
    if (bucket) {
      bucket.push(entry)
    } else {
      mealBuckets.set(key, [entry])
    }
  }

  const meals: MenuMeal[] = [...mealBuckets.entries()].map(([key, bucket]) => {
    const first = bucket[0]
    const mealDishNames = new Set(bucket.flatMap((entry) => entry.dishes.map((dish) => dish.name)))
    const dishes = bucket.flatMap((entry) =>
      entry.dishes.map((dish) =>
        enrichDish(dish, allergens, substitutes, substituteLibrary.recipes, {
          usedCounts,
          mealDishNames,
          mealPeriod: entry.mealPeriod,
          category: inferDishCategory(dish, entry.mealPeriod),
        }),
      ),
    )
    const riskDishCount = dishes.filter((dish) => dish.riskAllergens.length > 0).length
    const images = uniqueStrings(
      bucket
        .map((entry) => entry.sourceImage ?? '')
        .filter(Boolean)
        .map((src) => resolveAssetUrl(src)),
    ).map((src) => ({
      src,
      alt: `${formatDayHeading(first.date)} ${first.mealLabel || MEAL_LABELS[first.mealPeriod]}食谱原图`,
    }))
    const notes = uniqueStrings(bucket.map((entry) => entry.note ?? '').filter(Boolean))

    return {
      key,
      date: first.date,
      mealPeriod: first.mealPeriod,
      mealLabel: first.mealLabel || MEAL_LABELS[first.mealPeriod],
      dishes,
      images,
      notes,
      hasRisk: riskDishCount > 0,
      riskDishCount,
    }
  })

  const dayBuckets = new Map<string, MenuMeal[]>()
  for (const meal of meals) {
    const bucket = dayBuckets.get(meal.date)
    if (bucket) {
      bucket.push(meal)
    } else {
      dayBuckets.set(meal.date, [meal])
    }
  }

  return [...dayBuckets.entries()]
    .sort(([left], [right]) => compareIsoDates(left, right))
    .map(([date, dayMeals]) => {
      const sortedMeals = [...dayMeals].sort(
        (left, right) => MEAL_ORDER[left.mealPeriod] - MEAL_ORDER[right.mealPeriod],
      )
      const riskDishCount = sortedMeals.reduce((total, meal) => total + meal.riskDishCount, 0)

      return {
        date,
        dateLabel: formatDayHeading(date),
        weekdayLabel: weekdayLabel(date),
        meals: sortedMeals,
        hasRisk: riskDishCount > 0,
        riskDishCount,
      }
    })
}

export function buildExportRows(
  entries: RecipeEntry[],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
  substituteLibrary: SubstituteLibrary = { recipes: [] },
): ExportRow[] {
  const usedCounts = new Map<string, number>()
  const mealDishNames = new Map<string, Set<string>>()

  for (const entry of entries) {
    const mealKey = `${entry.date}__${entry.mealPeriod}`
    const names = mealDishNames.get(mealKey) ?? new Set<string>()
    for (const dish of entry.dishes) names.add(dish.name)
    mealDishNames.set(mealKey, names)
  }

  return entries
    .flatMap((entry) =>
      entry.dishes
        .map((dish) => {
          if (dish.riskAllergens.length === 0) return null

          const mealKey = `${entry.date}__${entry.mealPeriod}`
          const { recommendation } = getRecommendation(
            dish,
            allergens,
            substitutes,
            substituteLibrary.recipes,
            {
              usedCounts,
              mealDishNames: mealDishNames.get(mealKey) ?? new Set<string>(),
              mealPeriod: entry.mealPeriod,
              category: inferDishCategory(dish, entry.mealPeriod),
            },
          )

          return {
            date: entry.date,
            mealLabel: entry.mealLabel || MEAL_LABELS[entry.mealPeriod],
            dishName: dish.name,
            riskNames: getAllergenNames(dish.riskAllergens, allergens).join('、'),
            substitute: recommendation.length > 0 ? recommendation.join('、') : '待与幼儿园确认',
          }
        })
        .filter((row): row is ExportRow => row !== null),
    )
    .sort((left, right) => {
      const dateCompare = compareIsoDates(left.date, right.date)
      if (dateCompare !== 0) return dateCompare
      return mealOrderFromLabel(left.mealLabel) - mealOrderFromLabel(right.mealLabel)
    })
}

function mealOrderFromLabel(label: string): number {
  const entry = Object.entries(MEAL_LABELS).find(([, value]) => value === label)
  return entry ? MEAL_ORDER[entry[0] as keyof typeof MEAL_ORDER] : 99
}
