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

export const MEAL_TIMES: Record<MealPeriod, string> = {
  breakfast: '08:30',
  morningSnack: '10:00',
  lunch: '11:30',
  afternoonTea: '15:00',
  dinner: '17:30',
}

export interface Allergen {
  id: string
  name: string
  keywords: string[]
}

export type SubstitutesMap = Record<string, string[]>

export const DISH_CATEGORIES = ['蛋白', '主食', '饮品', '汤', '水果', '点心', '菜'] as const

export type DishCategory = (typeof DISH_CATEGORIES)[number]

export interface SubstituteRecipe {
  id: string
  name: string
  replaces: string[]
  ingredients: string[]
  usedFor?: string[]
  tags: string[]
  /** 只能替代这些餐次；缺省表示不限餐次。 */
  mealPeriods?: MealPeriod[]
  /** 只能替代这些品类的菜品；缺省表示不限品类。 */
  categories?: DishCategory[]
  verified?: boolean
  priority?: number
}

export interface SubstituteLibrary {
  updatedAt?: string
  recipes: SubstituteRecipe[]
}

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

export interface DishOccurrence {
  date: string
  week: string
  mealPeriod: MealPeriod
  mealLabel: string
}

export interface DishKnowledge {
  name: string
  aliases: string[]
  ingredients: string[]
  riskAllergens: string[]
  substitute: string | null
  firstSeen: string
  lastSeen: string
  occurrences: DishOccurrence[]
  sourceImages: string[]
  verified?: boolean
}

export interface DishCatalog {
  updatedAt?: string
  dishes: Record<string, DishKnowledge>
}

export interface AppSettings {
  updatedAt?: string
  schoolName?: string
  supplements: string[]
}

export interface DataBundle {
  recipes: RecipeEntry[]
  allergens: Allergen[]
  substitutes: SubstitutesMap
  substituteLibrary: SubstituteLibrary
  settings: AppSettings
  dishCatalog: DishCatalog
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
  substituteId?: string
  substituteTags: string[]
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

export interface CalendarDayCell {
  date: string
  weekday: string
  monthDay: string
  dayNumber: string
  hasMenu: boolean
  riskDishCount: number
  isToday: boolean
  isSelected: boolean
  isWeekend: boolean
}

export interface DishTraceTarget {
  date: string
  mealLabel: string
  mealTime: string
  dish: MenuDish
  images: MenuImage[]
  note?: string
  knowledge?: DishKnowledge
}
