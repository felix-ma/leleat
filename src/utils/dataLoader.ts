import {
  MEAL_PERIODS,
  type Allergen,
  type AppSettings,
  type DataBundle,
  type DishCatalog,
  type DishKnowledge,
  type DishOccurrence,
  type MealPeriod,
  type RecipeEntry,
  type SubstitutesMap,
} from '../types'
import { withBase } from './assets'
import { isIsoWeek, isoWeekForDate, parseIsoDate } from './date'

const RECIPES_ERROR = '食谱数据加载失败，请稍后重试或确认仓库资源。'
const ALLERGENS_ERROR = '过敏原配置加载失败，请稍后重试或确认仓库资源。'
const SUBSTITUTES_ERROR = '替餐配置加载失败，请稍后重试或确认仓库资源。'
const DEFAULT_SUPPLEMENTS = ['AD', 'VD', '五维口服液', '益生菌']

type DataSection = 'recipes' | 'allergens' | 'substitutes'

export class DataLoadError extends Error {
  readonly section: DataSection

  constructor(section: DataSection, message: string) {
    super(message)
    this.name = 'DataLoadError'
    this.section = section
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) return null
    result.push(item.trim())
  }
  return result
}

function warn(message: string): void {
  console.warn(`[leleat] ${message}`)
}

async function fetchOptionalJson(fileName: string): Promise<unknown | null> {
  const url = withBase(`assets/data/${fileName}`)

  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      warn(`${fileName} 返回 HTTP ${response.status}，使用内置默认值。`)
      return null
    }
    return (await response.json()) as unknown
  } catch (error) {
    console.warn(`[leleat] ${fileName} 加载失败，使用内置默认值。`, error)
    return null
  }
}

async function fetchJson(
  fileName: string,
  section: DataSection,
  friendlyMessage: string,
): Promise<unknown> {
  const url = withBase(`assets/data/${fileName}`)

  let response: Response
  try {
    response = await fetch(url, { cache: 'no-cache' })
  } catch (error) {
    console.error(`[leleat] 请求 ${url} 失败`, error)
    throw new DataLoadError(section, friendlyMessage)
  }

  if (!response.ok) {
    console.error(`[leleat] 请求 ${url} 返回 HTTP ${response.status}`)
    throw new DataLoadError(section, friendlyMessage)
  }

  try {
    return (await response.json()) as unknown
  } catch (error) {
    console.error(`[leleat] 解析 ${url} JSON 失败`, error)
    throw new DataLoadError(section, friendlyMessage)
  }
}

function parseDish(value: unknown, recipeIndex: number, dishIndex: number): RecipeEntry['dishes'][number] | null {
  if (!isRecord(value)) {
    warn(`recipes[${recipeIndex}].dishes[${dishIndex}] 不是对象，已跳过该条食谱。`)
    return null
  }

  if (typeof value.name !== 'string' || !value.name.trim()) {
    warn(`recipes[${recipeIndex}].dishes[${dishIndex}].name 无效，已跳过该条食谱。`)
    return null
  }

  const ingredients = parseStringArray(value.ingredients)
  if (ingredients === null) {
    warn(`recipes[${recipeIndex}].dishes[${dishIndex}].ingredients 无效，已跳过该条食谱。`)
    return null
  }

  const riskAllergens = parseStringArray(value.riskAllergens)
  if (riskAllergens === null) {
    warn(`recipes[${recipeIndex}].dishes[${dishIndex}].riskAllergens 无效，已跳过该条食谱。`)
    return null
  }

  if (value.substitute !== null && typeof value.substitute !== 'string') {
    warn(`recipes[${recipeIndex}].dishes[${dishIndex}].substitute 无效，已跳过该条食谱。`)
    return null
  }

  return {
    name: value.name.trim(),
    ingredients,
    riskAllergens,
    substitute: typeof value.substitute === 'string' ? value.substitute.trim() || null : null,
    ...(value.calorie !== undefined ? { calorie: value.calorie as number | string } : {}),
    ...(typeof value.noteForKindergarten === 'string'
      ? { noteForKindergarten: value.noteForKindergarten }
      : {}),
    ...(typeof value.verified === 'boolean' ? { verified: value.verified } : {}),
  }
}

function parseRecipeEntry(value: unknown, index: number): RecipeEntry | null {
  if (!isRecord(value)) {
    warn(`recipes[${index}] 不是对象，已跳过。`)
    return null
  }

  if (typeof value.date !== 'string' || !parseIsoDate(value.date)) {
    warn(`recipes[${index}].date 不是有效的 YYYY-MM-DD 日期，已跳过。`)
    return null
  }

  if (typeof value.week !== 'string' || !isIsoWeek(value.week)) {
    warn(`recipes[${index}].week 不是有效的 ISO 周，已跳过。`)
    return null
  }

  const derivedWeek = isoWeekForDate(value.date)
  if (derivedWeek !== value.week) {
    warn(`recipes[${index}] 的 date 与 week 不一致（应为 ${derivedWeek}），已跳过。`)
    return null
  }

  if (
    typeof value.mealPeriod !== 'string' ||
    !MEAL_PERIODS.includes(value.mealPeriod as MealPeriod)
  ) {
    warn(`recipes[${index}].mealPeriod 无效，已跳过。`)
    return null
  }

  if (typeof value.mealLabel !== 'string' || !value.mealLabel.trim()) {
    warn(`recipes[${index}].mealLabel 无效，已跳过。`)
    return null
  }

  if (!Array.isArray(value.dishes)) {
    warn(`recipes[${index}].dishes 不是数组，已跳过。`)
    return null
  }

  const dishes: RecipeEntry['dishes'] = []
  for (let dishIndex = 0; dishIndex < value.dishes.length; dishIndex += 1) {
    const dish = parseDish(value.dishes[dishIndex], index, dishIndex)
    if (!dish) return null
    dishes.push(dish)
  }

  let sourceImage: string | undefined
  if (value.sourceImage !== undefined) {
    if (typeof value.sourceImage !== 'string') {
      warn(`recipes[${index}].sourceImage 无效，已跳过。`)
      return null
    }
    sourceImage = value.sourceImage.trim() || undefined
  }

  let note: string | undefined
  if (value.note !== undefined) {
    if (typeof value.note !== 'string') {
      warn(`recipes[${index}].note 无效，已跳过。`)
      return null
    }
    note = value.note.trim() || undefined
  }

  return {
    date: value.date,
    week: value.week,
    mealPeriod: value.mealPeriod as MealPeriod,
    mealLabel: value.mealLabel.trim(),
    dishes,
    ...(sourceImage ? { sourceImage } : {}),
    ...(note ? { note } : {}),
    ...(value.calorie !== undefined ? { calorie: value.calorie as number | string } : {}),
    ...(typeof value.noteForKindergarten === 'string'
      ? { noteForKindergarten: value.noteForKindergarten }
      : {}),
    ...(typeof value.verified === 'boolean' ? { verified: value.verified } : {}),
  }
}

function parseRecipesDocument(value: unknown): { recipes: RecipeEntry[]; updatedAt?: string } {
  let rawRecipes: unknown[]
  let rawUpdatedAt: unknown

  if (Array.isArray(value)) {
    rawRecipes = value
  } else if (isRecord(value) && Array.isArray(value.recipes)) {
    rawRecipes = value.recipes
    rawUpdatedAt = value.updatedAt
  } else {
    throw new DataLoadError(
      'recipes',
      '食谱数据格式异常，请确认 recipes.json 为数组或包含 recipes 数组的对象。',
    )
  }

  const recipes: RecipeEntry[] = []
  rawRecipes.forEach((item, index) => {
    const parsed = parseRecipeEntry(item, index)
    if (parsed) recipes.push(parsed)
  })

  if (rawRecipes.length > 0 && recipes.length === 0) {
    console.error('[leleat] recipes.json 中没有通过校验的食谱条目。')
  }

  let updatedAt: string | undefined
  if (rawUpdatedAt !== undefined) {
    if (typeof rawUpdatedAt === 'string' && !Number.isNaN(new Date(rawUpdatedAt).getTime())) {
      updatedAt = rawUpdatedAt
    } else {
      warn('recipes.json 的 updatedAt 无效，已忽略。')
    }
  }

  return { recipes, updatedAt }
}

function parseAllergens(value: unknown): Allergen[] {
  if (!Array.isArray(value)) {
    throw new DataLoadError('allergens', '过敏原配置格式异常，请确认 allergens.json 为数组。')
  }

  const allergens: Allergen[] = []
  const seenIds = new Set<string>()

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      warn(`allergens[${index}] 不是对象，已跳过。`)
      return
    }

    if (typeof item.id !== 'string' || !item.id.trim()) {
      warn(`allergens[${index}].id 无效，已跳过。`)
      return
    }

    if (typeof item.name !== 'string' || !item.name.trim()) {
      warn(`allergens[${index}].name 无效，已跳过。`)
      return
    }

    const keywords = parseStringArray(item.keywords)
    if (keywords === null) {
      warn(`allergens[${index}].keywords 无效，已跳过。`)
      return
    }

    const id = item.id.trim()
    if (seenIds.has(id)) {
      warn(`allergens[${index}].id "${id}" 重复，已跳过。`)
      return
    }

    seenIds.add(id)
    allergens.push({ id, name: item.name.trim(), keywords })
  })

  if (allergens.length === 0) {
    throw new DataLoadError('allergens', '过敏原配置中没有有效数据，请检查 allergens.json。')
  }

  return allergens
}

function parseSubstitutes(value: unknown): SubstitutesMap {
  if (!isRecord(value)) {
    throw new DataLoadError(
      'substitutes',
      '替餐配置格式异常，请确认 substitutes.json 为对象。',
    )
  }

  const substitutes: SubstitutesMap = {}
  for (const [rawKey, rawOptions] of Object.entries(value)) {
    const key = rawKey.trim()
    const options = parseStringArray(rawOptions)

    if (!key || options === null) {
      warn(`substitutes["${rawKey}"] 无效，已跳过。`)
      continue
    }

    substitutes[key] = options
  }

  return substitutes
}

function parseSettings(value: unknown): AppSettings {
  if (!isRecord(value)) {
    if (value !== null) warn('settings.json 格式无效，使用内置补剂配置。')
    return { supplements: [...DEFAULT_SUPPLEMENTS] }
  }

  const parsedSupplements = parseStringArray(value.supplements)
  const supplements =
    parsedSupplements && parsedSupplements.length > 0
      ? [...new Set(parsedSupplements)]
      : [...DEFAULT_SUPPLEMENTS]

  const updatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(new Date(value.updatedAt).getTime())
      ? value.updatedAt
      : undefined

  return {
    supplements,
    ...(updatedAt ? { updatedAt } : {}),
    ...(typeof value.schoolName === 'string' && value.schoolName.trim()
      ? { schoolName: value.schoolName.trim() }
      : {}),
  }
}

function parseDishOccurrences(value: unknown): DishOccurrence[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    if (typeof item.date !== 'string' || !parseIsoDate(item.date)) return []
    if (typeof item.week !== 'string' || !isIsoWeek(item.week)) return []
    if (
      typeof item.mealPeriod !== 'string' ||
      !MEAL_PERIODS.includes(item.mealPeriod as MealPeriod)
    ) {
      return []
    }

    return [
      {
        date: item.date,
        week: item.week,
        mealPeriod: item.mealPeriod as MealPeriod,
        mealLabel:
          typeof item.mealLabel === 'string' && item.mealLabel.trim()
            ? item.mealLabel.trim()
            : item.mealPeriod,
      },
    ]
  })
}

function parseDishCatalog(value: unknown): DishCatalog {
  if (!isRecord(value) || !isRecord(value.dishes)) {
    if (value !== null) warn('dish-catalog.json 格式无效，知识库按空目录处理。')
    return { dishes: {} }
  }

  const dishes: Record<string, DishKnowledge> = {}

  for (const [rawKey, rawDish] of Object.entries(value.dishes)) {
    if (!isRecord(rawDish)) {
      warn(`dish-catalog.json 中 "${rawKey}" 不是对象，已跳过。`)
      continue
    }

    const name =
      typeof rawDish.name === 'string' && rawDish.name.trim()
        ? rawDish.name.trim()
        : rawKey.trim()
    const ingredients = parseStringArray(rawDish.ingredients)
    if (!name || !ingredients) {
      warn(`dish-catalog.json 中 "${rawKey}" 缺少有效名称或食材，已跳过。`)
      continue
    }

    const riskAllergens = parseStringArray(rawDish.riskAllergens) ?? []
    const aliases = parseStringArray(rawDish.aliases) ?? []
    const sourceImages = parseStringArray(rawDish.sourceImages) ?? []
    const occurrences = parseDishOccurrences(rawDish.occurrences)
    const firstSeen =
      typeof rawDish.firstSeen === 'string' && parseIsoDate(rawDish.firstSeen)
        ? rawDish.firstSeen
        : occurrences[0]?.date ?? ''
    const lastSeen =
      typeof rawDish.lastSeen === 'string' && parseIsoDate(rawDish.lastSeen)
        ? rawDish.lastSeen
        : occurrences[occurrences.length - 1]?.date ?? firstSeen

    dishes[name] = {
      name,
      aliases,
      ingredients,
      riskAllergens,
      substitute: typeof rawDish.substitute === 'string' ? rawDish.substitute.trim() || null : null,
      firstSeen,
      lastSeen,
      occurrences,
      sourceImages,
      ...(typeof rawDish.verified === 'boolean' ? { verified: rawDish.verified } : {}),
    }
  }

  const updatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(new Date(value.updatedAt).getTime())
      ? value.updatedAt
      : undefined

  return { dishes, ...(updatedAt ? { updatedAt } : {}) }
}

function warnUnknownAllergens(recipes: RecipeEntry[], allergens: Allergen[]): void {
  const knownIds = new Set(allergens.map((allergen) => allergen.id))
  const warnedIds = new Set<string>()

  for (const recipe of recipes) {
    for (const dish of recipe.dishes) {
      for (const id of dish.riskAllergens) {
        if (!knownIds.has(id) && !warnedIds.has(id)) {
          warnedIds.add(id)
          warn(`风险过敏原 id "${id}" 不在 allergens.json 中，页面将直接显示该 id。`)
        }
      }
    }
  }
}

export async function loadStaticData(): Promise<DataBundle> {
  const [rawRecipes, rawAllergens, rawSubstitutes, rawSettings, rawDishCatalog] =
    await Promise.all([
      fetchJson('recipes.json', 'recipes', RECIPES_ERROR),
      fetchJson('allergens.json', 'allergens', ALLERGENS_ERROR),
      fetchJson('substitutes.json', 'substitutes', SUBSTITUTES_ERROR),
      fetchOptionalJson('settings.json'),
      fetchOptionalJson('dish-catalog.json'),
    ])

  const { recipes, updatedAt } = parseRecipesDocument(rawRecipes)
  const allergens = parseAllergens(rawAllergens)
  const substitutes = parseSubstitutes(rawSubstitutes)
  const settings = parseSettings(rawSettings)
  const dishCatalog = parseDishCatalog(rawDishCatalog)

  warnUnknownAllergens(recipes, allergens)

  return {
    recipes,
    allergens,
    substitutes,
    settings,
    dishCatalog,
    updatedAt,
  }
}
