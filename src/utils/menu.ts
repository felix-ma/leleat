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
const PROTEIN_HINTS = [
  '瘦肉', '猪肉', '五花肉', '肉末', '肉沫', '牛肉', '鸡肉', '鸡胸', '鲜鸡', '鸭肉', '老鸭',
  '鱼', '虾', '蛋', '豆腐', '豆干', '豆皮', '腐竹', '排骨', '猪肝', '火腿', '肠', '鹌鹑',
  '黄豆', '花生',
]
const VEGETABLE_HINTS = [
  '青菜', '时菜', '包菜', '白菜', '菠菜', '生菜', '西兰花', '萝卜', '冬瓜', '丝瓜', '南瓜',
  '黄瓜', '菇', '木耳', '番茄', '西红柿', '豆角', '茄子', '莲藕', '芹菜', '韭菜', '芽菜',
  '玉米粒',
]
/** 汤水类：一餐里两样都是稀的，看护人不好配。 */
const LIQUID_HINTS = ['粥', '汤', '羹', '糊', '米线']
/** 蛋白质来源分组：避免一餐里出现两份同类蛋白（如汤里有瘦肉、替餐又是瘦肉粥）。 */
const PROTEIN_GROUPS: { label: string; hints: string[] }[] = [
  { label: '猪肉', hints: ['瘦肉', '猪肉', '五花肉', '肉末', '肉沫', '排骨', '猪肝', '火腿', '肠'] },
  { label: '鸡肉', hints: ['鸡肉', '鸡胸', '鲜鸡', '鸡丝'] },
  { label: '牛肉', hints: ['牛肉', '牛腩'] },
  { label: '鱼虾', hints: ['鱼', '虾'] },
  { label: '蛋', hints: ['蛋'] },
  { label: '豆制品', hints: ['豆腐', '豆干', '豆皮', '腐竹', '黄豆', '豆浆'] },
  { label: '鸭肉', hints: ['鸭肉', '老鸭'] },
]

function isLiquidDish(name: string): boolean {
  return LIQUID_HINTS.some((hint) => name.includes(hint))
}

function proteinGroupsOf(text: string): string[] {
  return PROTEIN_GROUPS.filter((group) => group.hints.some((hint) => text.includes(hint))).map(
    (group) => group.label,
  )
}

function daysBetween(left: string, right: string): number {
  const leftTime = Date.parse(`${left}T00:00:00Z`)
  const rightTime = Date.parse(`${right}T00:00:00Z`)
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 99
  return Math.round(Math.abs(rightTime - leftTime) / 86400000)
}

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
  /** 本餐其它菜（不含当前这道）的搭配画像，用来避免「两个都是稀的」。 */
  profile: MealProfile
  /** 每个餐次上一次用的替餐，用来避免连两天上同一道。 */
  recentByPeriod: Map<string, { date: string; name: string }>
  date: string
}

/** 一餐里其余菜的结构画像：汤水数量、主食数量、已出现的蛋白来源。 */
export interface MealProfile {
  liquidCount: number
  stapleCount: number
  proteinGroups: Set<string>
}

function buildMealProfile(
  dishes: { name: string; ingredients: string[] }[],
  mealPeriod: MealPeriod,
): MealProfile {
  let liquidCount = 0
  let stapleCount = 0
  const proteinGroups = new Set<string>()
  for (const dish of dishes) {
    if (isLiquidDish(dish.name)) liquidCount += 1
    if (inferDishCategory(dish, mealPeriod) === '主食') stapleCount += 1
    for (const group of proteinGroupsOf(dish.name + dish.ingredients.join(''))) {
      proteinGroups.add(group)
    }
  }
  return { liquidCount, stapleCount, proteinGroups }
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
  // 连两天上同一道替餐：强烈降权，但不排除（没有别的可选时仍然可用）。
  const recent = context.recentByPeriod.get(context.mealPeriod)
  const repeatPenalty =
    recent?.name === recipe.name ? (daysBetween(recent.date, context.date) <= 1 ? 3000 : 600) : 0
  // 本餐已经有汤水了，再上一道汤/粥就变成两样稀的。
  const liquidPenalty = isLiquidDish(recipe.name) && context.profile.liquidCount >= 1 ? 600 : 0
  // 本餐已经有同类蛋白（例如汤里的瘦肉），替餐别再撞同一个来源。
  const proteinPenalty = proteinGroupsOf(recipe.name + recipe.ingredients.join('')).some((group) =>
    context.profile.proteinGroups.has(group),
  )
    ? 300
    : 0
  return (
    exactMatch +
    verified +
    categoryBoost +
    (recipe.priority ?? 0) -
    usedPenalty -
    duplicatePenalty -
    similarPenalty -
    repeatPenalty -
    liquidPenalty -
    proteinPenalty
  )
}

function inMealPeriod(recipe: SubstituteRecipe, mealPeriod: MealPeriod): boolean {
  return !recipe.mealPeriods?.length || recipe.mealPeriods.includes(mealPeriod)
}

function inCategory(recipe: SubstituteRecipe, category: DishCategory): boolean {
  return !recipe.categories?.length || recipe.categories.includes(category)
}

/**
 * 原菜的关键营养结构：有肉/蛋/豆就要求蛋白质，有蔬菜就要求蔬菜，有主食就要求主食。
 * 只做「有无」判断，不编造克重或热量数值。
 */
function inferNutritionNeeds(dish: { name: string; ingredients: string[] }): string[] {
  const text = dish.name + dish.ingredients.join('')
  const needs: string[] = []
  if (PROTEIN_HINTS.some((hint) => text.includes(hint))) needs.push('蛋白质')
  if (VEGETABLE_HINTS.some((hint) => text.includes(hint))) needs.push('蔬菜')
  if (STAPLE_HINTS.some((hint) => text.includes(hint))) needs.push('主食')
  if (FRUIT_HINTS.some((hint) => dish.name.includes(hint))) needs.push('水果')
  return needs
}

function coversNutrition(recipe: SubstituteRecipe, needs: string[]): boolean {
  if (needs.length === 0) return true
  const tags = new Set((recipe.tags ?? []).map((tag) => (tag === '蛋白' ? '蛋白质' : tag)))
  return needs.every((need) => tags.has(need))
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
    context.recentByPeriod.set(context.mealPeriod, { date: context.date, name: custom })
    return { recommendation: [custom], source: 'dish', tags: [] }
  }

  if (dish.riskAllergens.length === 0) {
    return { recommendation: [], source: 'none', tags: [] }
  }

  const allSatisfied = library.filter((recipe) =>
    dish.riskAllergens.every((id) => recipe.replaces.includes(id)),
  )

  // 从严格到宽松依次尝试：先保证营养结构、品类、餐次都对得上，实在没有才逐级放宽。
  const needs = inferNutritionNeeds(dish)
  const nutritionOk = (recipe: SubstituteRecipe) => coversNutrition(recipe, needs)
  const inPeriod = (recipe: SubstituteRecipe) => inMealPeriod(recipe, context.mealPeriod)
  const inCat = (recipe: SubstituteRecipe) => inCategory(recipe, context.category)

  const tiers = [
    allSatisfied.filter((recipe) => inPeriod(recipe) && inCat(recipe) && nutritionOk(recipe)),
    allSatisfied.filter((recipe) => inPeriod(recipe) && nutritionOk(recipe)),
    allSatisfied.filter((recipe) => inCat(recipe) && nutritionOk(recipe)),
    allSatisfied.filter((recipe) => inPeriod(recipe) && inCat(recipe)),
    allSatisfied.filter((recipe) => inPeriod(recipe)),
    allSatisfied.filter((recipe) => inCat(recipe)),
    allSatisfied,
  ]

  const candidates = (tiers.find((tier) => tier.length > 0) ?? [])
    .map((recipe) => ({ recipe, score: scoreCandidate(recipe, dish.name, context) }))
    .sort((left, right) => right.score - left.score)

  if (candidates.length > 0) {
    const chosen = candidates[0].recipe
    context.usedCounts.set(chosen.id, (context.usedCounts.get(chosen.id) ?? 0) + 1)
    context.recentByPeriod.set(context.mealPeriod, { date: context.date, name: chosen.name })
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

/**
 * 替餐落地后的整餐审核：把「原菜 + 替餐」当成一张真实菜单检查搭配。
 * 只报结构问题（缺主食、两样稀的、蛋白重复），不给营养数值。
 * 点心餐（早点/午点）本身只给水果或小食，不做正餐标准审核。
 */
export function auditMeal(
  dishes: MenuDish[],
  mealPeriod: MealPeriod,
  library: SubstituteRecipe[] = [],
): string[] {
  if (mealPeriod === 'morningSnack' || mealPeriod === 'afternoonTea') return []

  const issues: string[] = []
  const finalNames = dishes.map((dish) => dish.recommendation[0] ?? dish.name)
  const substituted = dishes.map((dish) => dish.recommendation.length > 0)
  const libraryById = new Map(library.map((recipe) => [recipe.id, recipe]))
  const texts = dishes.map((dish, index) => {
    // 已替换的菜按替餐本身的食材算，避免拿原菜的食材制造假重复。
    const recipe = dish.substituteId ? libraryById.get(dish.substituteId) : undefined
    return finalNames[index] + (recipe ? recipe.ingredients.join('') : dish.ingredients.join(''))
  })

  const staples = finalNames.filter(
    (name) => inferDishCategory({ name, ingredients: [] }, mealPeriod) === '主食',
  )
  const liquids = finalNames.filter((name) => isLiquidDish(name))

  if (staples.length === 0) {
    issues.push('这一餐没有主食')
  }
  if (liquids.length >= 2) {
    issues.push(`两样都是汤水（${liquids.join('、')}），缺干点`)
  }
  if (staples.length >= 2 && liquids.length === 0 && mealPeriod === 'breakfast') {
    issues.push('两样都是干主食，可配一份粥/汤')
  }

  // 只有在替餐参与时才算「替餐带来的重复」，原菜单本身的重复不归替餐管。
  const groups = texts.flatMap((text, index) =>
    proteinGroupsOf(text).map((group) => ({ group, index })),
  )
  const duplicated = [
    ...new Set(
      groups
        .filter(
          (item) =>
            groups.filter((other) => other.group === item.group).length >= 2 &&
            groups.some(
              (other) =>
                other.group === item.group && other.index !== item.index && substituted[other.index],
            ),
        )
        .map((item) => item.group),
    ),
  ]
  if (duplicated.length > 0) {
    issues.push(`替餐和本餐其它菜蛋白质来源重复（${duplicated.join('、')}）`)
  }

  if (mealPeriod === 'lunch' || mealPeriod === 'dinner') {
    const hasVegetable = texts.some((text) => VEGETABLE_HINTS.some((hint) => text.includes(hint)))
    if (!hasVegetable) issues.push('这一餐没有蔬菜')
    if (!texts.some((text) => proteinGroupsOf(text).length > 0)) {
      issues.push('这一餐没有蛋白质')
    }
  }

  return issues
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
  // 每个餐次上一次用的替餐，避免连两天同一道。
  const recentByPeriod = new Map<string, { date: string; name: string }>()

  for (const entry of entries) {
    const key = `${entry.date}__${entry.mealPeriod}`
    const bucket = mealBuckets.get(key)
    if (bucket) {
      bucket.push(entry)
    } else {
      mealBuckets.set(key, [entry])
    }
  }

  const orderedBuckets = [...mealBuckets.entries()].sort(([left], [right]) => {
    const dateCompare = compareIsoDates(left.slice(0, 10), right.slice(0, 10))
    if (dateCompare !== 0) return dateCompare
    return MEAL_ORDER[left.split('__')[1] as MealPeriod] - MEAL_ORDER[right.split('__')[1] as MealPeriod]
  })

  const meals: MenuMeal[] = orderedBuckets.map(([key, bucket]) => {
    const first = bucket[0]
    const mealDishNames = new Set(bucket.flatMap((entry) => entry.dishes.map((dish) => dish.name)))
    const bucketDishes = bucket.flatMap((entry) => entry.dishes)
    const dishes = bucket.flatMap((entry) =>
      entry.dishes.map((dish) =>
        enrichDish(dish, allergens, substitutes, substituteLibrary.recipes, {
          usedCounts,
          mealDishNames,
          mealPeriod: entry.mealPeriod,
          category: inferDishCategory(dish, entry.mealPeriod),
          profile: buildMealProfile(
            bucketDishes.filter((item) => item.name !== dish.name),
            entry.mealPeriod,
          ),
          recentByPeriod,
          date: entry.date,
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
      audit: auditMeal(dishes, first.mealPeriod, substituteLibrary.recipes),
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
        auditCount: sortedMeals.reduce((total, meal) => total + meal.audit.length, 0),
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
  const recentByPeriod = new Map<string, { date: string; name: string }>()
  const mealDishNames = new Map<string, Set<string>>()
  const mealDishes = new Map<string, RecipeEntry['dishes']>()

  for (const entry of entries) {
    const mealKey = `${entry.date}__${entry.mealPeriod}`
    const names = mealDishNames.get(mealKey) ?? new Set<string>()
    for (const dish of entry.dishes) names.add(dish.name)
    mealDishNames.set(mealKey, names)
    mealDishes.set(mealKey, [...(mealDishes.get(mealKey) ?? []), ...entry.dishes])
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
              profile: buildMealProfile(
                (mealDishes.get(mealKey) ?? []).filter((item) => item.name !== dish.name),
                entry.mealPeriod,
              ),
              recentByPeriod,
              date: entry.date,
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
