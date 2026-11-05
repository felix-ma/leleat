import {
  MEAL_LABELS,
  MEAL_ORDER,
  type Allergen,
  type ExportRow,
  type MenuDay,
  type MenuDish,
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

function getRecommendation(
  dish: RecipeEntry['dishes'][number],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
  library: SubstituteRecipe[],
  usedCandidateIds: Set<string>,
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

  const allSatisfied = (recipe: SubstituteRecipe): boolean =>
    dish.riskAllergens.every((id) => recipe.replaces.includes(id))

  const candidates = library
    .filter(allSatisfied)
    .filter((recipe) => !usedCandidateIds.has(recipe.id))
    .map((recipe) => {
      const exactMatch = recipe.usedFor?.includes(dish.name) ? 1000 : 0
      const verified = recipe.verified ? 100 : 0
      return { recipe, score: exactMatch + verified + (recipe.priority ?? 0) }
    })
    .sort((left, right) => right.score - left.score)

  if (candidates.length > 0) {
    const chosen = candidates[0].recipe
    usedCandidateIds.add(chosen.id)
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
  usedCandidateIds: Set<string>,
): MenuDish {
  const { recommendation, source, substituteId, tags } = getRecommendation(
    dish,
    allergens,
    substitutes,
    library,
    usedCandidateIds,
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
    const usedCandidateIds = new Set<string>()
    const dishes = bucket.flatMap((entry) =>
      entry.dishes.map((dish) =>
        enrichDish(
          dish,
          allergens,
          substitutes,
          substituteLibrary.recipes,
          usedCandidateIds,
        ),
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
  const usedByMeal = new Map<string, Set<string>>()

  return entries
    .flatMap((entry) =>
      entry.dishes
        .map((dish) => {
          if (dish.riskAllergens.length === 0) return null

          const mealKey = `${entry.date}__${entry.mealPeriod}`
          const usedCandidateIds = usedByMeal.get(mealKey) ?? new Set<string>()
          usedByMeal.set(mealKey, usedCandidateIds)
          const { recommendation } = getRecommendation(
            dish,
            allergens,
            substitutes,
            substituteLibrary.recipes,
            usedCandidateIds,
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
