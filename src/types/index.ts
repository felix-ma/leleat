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
  /** 做法：家长自己在家做好带到幼儿园，写成能直接照做的短句。 */
  method?: string
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
  /**
   * 配方变体 id，形如 `菜名#a1b2c3d4`，由「菜名 + 排序后的食材」内容寻址生成。
   * 同名菜在不同周可能有不同配方，variantId 是区分它们的稳定键。
   */
  variantId?: string
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

/** 单周食谱文件 weeks/YYYY-Www.json 的结构。 */
export interface WeekDocument {
  week: string
  startDate: string
  endDate: string
  updatedAt?: string
  recipes: RecipeEntry[]
}

/** index.json 里的一条周记录，前端据此生成周选项，不必加载周文件本身。 */
export interface WeekIndexEntry {
  week: string
  startDate: string
  endDate: string
  file: string
  dates: string[]
  meals: number
  dishes: number
}

/** index.json：周清单与数据范围，是前端的入口文件。 */
export interface DataIndex {
  updatedAt?: string
  weeks: WeekIndexEntry[]
  range: { startDate: string; endDate: string }
  total: { weeks: number; dates: number; meals: number; dishes: number }
}

export interface DishOccurrence {
  date: string
  mealPeriod: MealPeriod
  /** 指回当次命中的配方变体。 */
  variantId?: string
}

/** 同一菜名下的一种配方。同名菜在不同周配方不同时会有多个变体。 */
export interface DishVariant {
  variantId: string
  ingredients: string[]
  riskAllergens: string[]
  count: number
  firstSeen: string
  lastSeen: string
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
  /** 该菜名下的全部配方变体（按出现次数降序）。 */
  variants?: DishVariant[]
  /** 当前主配方指向的变体；历史配方仍在 variants[] 里。 */
  primaryVariantId?: string
  /** 主配方是怎么选出来的：latest=最近一次出现 / frequency=出现次数最多 / manual=人工钉住。 */
  primaryBasis?: 'latest' | 'frequency' | 'manual'
  /** 同名菜存在多种配方且尚未定口径，等人工复核是否要统一或加别名。 */
  needsReview?: boolean
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
  /** 周清单，前端的入口；周食谱自身按需加载。 */
  index: DataIndex
  allergens: Allergen[]
  substitutes: SubstitutesMap
  substituteLibrary: SubstituteLibrary
  settings: AppSettings
  dishCatalog: DishCatalog
  updatedAt?: string
}

export interface IngredientHit {
  /** 只在写法与规范名不同时出现。 */
  form?: string
  dish: string
  variantId: string
  date: string
  mealPeriod: MealPeriod
}

export interface IngredientRecord {
  forms: string[]
  dishCount: number
  hitCount: number
  firstSeen: string
  lastSeen: string
  dishes: string[]
  hits: IngredientHit[]
}

/** 食材索引：按规范食材名聚合，可反查命中的菜名、配方与日期。 */
export interface IngredientIndex {
  updatedAt?: string
  note?: string
  total: { ingredients: number; hits: number; dishes: number; variants: number }
  ingredients: Record<string, IngredientRecord>
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
  /** 替餐做法，只有动态替餐库命中时才有。 */
  substituteMethod?: string
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
  /** 替餐落地后的整餐搭配审核结果，不含营养数值。 */
  audit: string[]
  hasRisk: boolean
  riskDishCount: number
}

export interface MenuDay {
  date: string
  dateLabel: string
  weekdayLabel: string
  meals: MenuMeal[]
  auditCount: number
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
