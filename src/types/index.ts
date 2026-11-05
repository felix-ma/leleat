export const MEAL_PERIODS = ['breakfast', 'morningSnack', 'lunch', 'afternoonTea', 'dinner'] as const

export type MealPeriod = (typeof MEAL_PERIODS)[number]

export const MEAL_LABELS: Record<MealPeriod, string> = {
  breakfast: '早餐',
  morningSnack: '早点',
  lunch: '午餐',
  afternoonTea: '午点',
  dinner: '晚餐',
}

export const MEAL_ORDER: Record<MealPeriod, number> = {
  breakfast: 0,
  morningSnack: 1,
  lunch: 2,
  afternoonTea: 3,
  dinner: 4,
}

export interface Allergen {
  id: string
  name: string
  keywords: string[]
}

export type SubstitutesMap = Record<string, string[]>

export interface Dish {
  name: string
  ingredients: string[]
  riskAllergens: string[]
  substitute: string | null
  /** 预留字段，v0.1 不展示。 */
  calorie?: number | string
  noteForKindergarten?: string
  verified?: boolean
}

export interface RecipeEntry {
  date: string
  week: string
  mealPeriod: MealPeriod
  mealLabel: string
  dishes: Dish[]
  sourceImage?: string
  note?: string
  /** 预留字段，v0.1 忽略未知字段。 */
  calorie?: number | string
  noteForKindergarten?: string
  verified?: boolean
}

/** recipes.json 同时兼容裸数组与带 updatedAt 的对象格式。 */
export interface RecipesDocument {
  updatedAt?: string
  recipes: RecipeEntry[]
}

export interface DataBundle {
  recipes: RecipeEntry[]
  allergens: Allergen[]
  substitutes: SubstitutesMap
  updatedAt?: string
}

export interface WeekOption {
  week: string
  startDate: string
  endDate: string
  /** 例：2026年11月2日 – 11月8日 */
  label: string
  /** 例：11月2日 – 11月8日 */
  shortLabel: string
}

export type SubstituteSource = 'dish' | 'library' | 'none'

export interface MenuDish extends Dish {
  allergenNames: string[]
  recommendation: string[]
  substituteSource: SubstituteSource
}

export interface MenuImage {
  src: string
  alt: string
}

export interface MenuMeal {
  key: string
  date: string
  mealPeriod: MealPeriod
  mealLabel: string
  dishes: MenuDish[]
  images: MenuImage[]
  notes: string[]
  hasRisk: boolean
  riskDishCount: number
}

export interface MenuDay {
  date: string
  dateLabel: string
  weekdayLabel: string
  meals: MenuMeal[]
  hasRisk: boolean
  riskDishCount: number
}

export interface ExportRow {
  date: string
  mealLabel: string
  dishName: string
  riskNames: string
  substitute: string
}

export interface ImagePreview {
  src: string
  alt: string
}
