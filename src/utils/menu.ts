import {
  MEAL_LABELS,
  MEAL_ORDER,
  type Allergen,
  type ExportRow,
  type MenuDay,
  type MenuDish,
  type MenuMeal,
  type RecipeEntry,
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
): { recommendation: string[]; source: SubstituteSource } {
  const custom = typeof dish.substitute === 'string' ? dish.substitute.trim() : ''
  if (custom) {
    return { recommendation: [custom], source: 'dish' }
  }

  if (dish.riskAllergens.length === 0) {
    return { recommendation: [], source: 'none' }
  }

  const allergenMap = new Map(allergens.map((allergen) => [allergen.id, allergen]))
  const recommendation: string[] = []

  for (const id of dish.riskAllergens) {
    const name = allergenNameFor(id, allergenMap)
    // 优先按中文名匹配，同时兼容 Agent 以 id 作为 key 的情况。
    const options = substitutes[name] ?? substitutes[id] ?? []
    recommendation.push(...options)
  }

  const deduped = uniqueStrings(recommendation)
  return {
    recommendation: deduped,
    source: deduped.length > 0 ? 'library' : 'none',
  }
}

function enrichDish(
  dish: RecipeEntry['dishes'][number],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
): MenuDish {
  const { recommendation, source } = getRecommendation(dish, allergens, substitutes)

  return {
    ...dish,
    allergenNames: getAllergenNames(dish.riskAllergens, allergens),
    recommendation,
    substituteSource: source,
  }
}

export function buildMenuDays(
  entries: RecipeEntry[],
  allergens: Allergen[],
  substitutes: SubstitutesMap,
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
    const dishes = bucket.flatMap((entry) =>
      entry.dishes.map((dish) => enrichDish(dish, allergens, substitutes)),
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
): ExportRow[] {
  return entries
    .flatMap((entry) =>
      entry.dishes
        .map((dish) => {
          if (dish.riskAllergens.length === 0) return null

          const { recommendation } = getRecommendation(dish, allergens, substitutes)

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

export function countSafeMeals(days: MenuDay[]): number {
  return days.reduce((total, day) => total + day.meals.filter((meal) => !meal.hasRisk).length, 0)
}

export function filterWeekMenu(
  recipes: RecipeEntry[],
  week: string,
  allergens: Allergen[],
  substitutes: SubstitutesMap,
): MenuDay[] {
  return buildMenuDays(getWeekEntries(recipes, week), allergens, substitutes)
}
