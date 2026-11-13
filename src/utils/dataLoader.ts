import {
  DISH_CATEGORIES,
  MEAL_PERIODS,
  type Allergen,
  type AppSettings,
  type DataBundle,
  type DataIndex,
  type DishCatalog,
  type DishCategory,
  type DishKnowledge,
  type DishOccurrence,
  type DishVariant,
  type IngredientIndex,
  type IngredientRecord,
  type MealPeriod,
  type RecipeEntry,
  type SubstituteLibrary,
  type SubstituteRecipe,
  type SubstitutesMap,
  type WeekIndexEntry,
} from '../types'
import { withBase } from './assets'
import { isIsoWeek, isoWeekForDate, parseIsoDate } from './date'

const INDEX_ERROR = '周清单 index.json 加载失败，请稍后重试或确认仓库资源。'
const WEEK_ERROR = '周食谱文件加载失败，请稍后重试或确认仓库资源。'
const ALLERGENS_ERROR = '过敏原配置加载失败，请稍后重试或确认仓库资源。'
const SUBSTITUTES_ERROR = '替餐配置加载失败，请稍后重试或确认仓库资源。'
const DEFAULT_SUPPLEMENTS = ['AD', 'VD', '五维口服液', '益生菌']

type DataSection = 'index' | 'week' | 'allergens' | 'substitutes'

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
    ...(typeof value.variantId === 'string' && value.variantId.trim()
      ? { variantId: value.variantId.trim() }
      : {}),
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

function parseUpdatedAt(value: unknown, fileName: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) return value
  warn(`${fileName} 的 updatedAt 无效，已忽略。`)
  return undefined
}

/** 解析 index.json：周清单是前端入口，前端据此生成周选项，不必加载周文件本身。 */
function parseDataIndex(value: unknown): DataIndex {
  if (!isRecord(value) || !Array.isArray(value.weeks)) {
    throw new DataLoadError('index', '周清单格式异常，请确认 index.json 包含 weeks 数组。')
  }

  const weeks: WeekIndexEntry[] = []
  value.weeks.forEach((item, index) => {
    if (!isRecord(item)) {
      warn(`index.json weeks[${index}] 不是对象，已跳过。`)
      return
    }
    const { week, startDate, endDate, file, dates } = item
    if (typeof week !== 'string' || !isIsoWeek(week)) {
      warn(`index.json weeks[${index}].week 无效，已跳过。`)
      return
    }
    if (typeof startDate !== 'string' || !parseIsoDate(startDate)) {
      warn(`index.json weeks[${index}].startDate 无效，已跳过。`)
      return
    }
    if (typeof endDate !== 'string' || !parseIsoDate(endDate)) {
      warn(`index.json weeks[${index}].endDate 无效，已跳过。`)
      return
    }
    if (typeof file !== 'string' || !file.trim()) {
      warn(`index.json weeks[${index}].file 无效，已跳过。`)
      return
    }
    const cleanDates = parseStringArray(dates) ?? []
    if (cleanDates.length === 0) {
      warn(`index.json weeks[${index}].dates 为空，已跳过。`)
      return
    }

    weeks.push({
      week,
      startDate,
      endDate,
      file: file.trim(),
      dates: cleanDates,
      meals: typeof item.meals === 'number' ? item.meals : 0,
      dishes: typeof item.dishes === 'number' ? item.dishes : 0,
    })
  })

  if (weeks.length === 0) {
    throw new DataLoadError('index', '周清单里没有有效的周，请确认 index.json 内容。')
  }

  weeks.sort((a, b) => a.startDate.localeCompare(b.startDate))

  const range = isRecord(value.range) ? value.range : {}
  const total = isRecord(value.total) ? value.total : {}
  const firstDate = weeks[0].startDate
  const lastDate = weeks[weeks.length - 1].endDate

  const updatedAt = parseUpdatedAt(value.updatedAt, 'index.json')

  return {
    weeks,
    range: {
      startDate:
        typeof range.startDate === 'string' && parseIsoDate(range.startDate)
          ? range.startDate
          : firstDate,
      endDate:
        typeof range.endDate === 'string' && parseIsoDate(range.endDate) ? range.endDate : lastDate,
    },
    total: {
      weeks: typeof total.weeks === 'number' ? total.weeks : weeks.length,
      dates: typeof total.dates === 'number' ? total.dates : weeks.reduce((n, w) => n + w.dates.length, 0),
      meals: typeof total.meals === 'number' ? total.meals : 0,
      dishes: typeof total.dishes === 'number' ? total.dishes : 0,
    },
    ...(updatedAt ? { updatedAt } : {}),
  }
}

/** 解析单周文件 weeks/YYYY-Www.json。 */
function parseWeekDocument(value: unknown, expectedWeek: string): RecipeEntry[] {
  if (!isRecord(value) || !Array.isArray(value.recipes)) {
    throw new DataLoadError('week', `${expectedWeek} 的周食谱格式异常，请确认包含 recipes 数组。`)
  }
  if (typeof value.week === 'string' && value.week !== expectedWeek) {
    warn(`${expectedWeek} 文件里的 week 字段是 ${value.week}，与文件名不一致。`)
  }

  const recipes: RecipeEntry[] = []
  value.recipes.forEach((item, index) => {
    const parsed = parseRecipeEntry(item, index)
    if (!parsed) return
    if (parsed.week !== expectedWeek) {
      warn(`${expectedWeek} 文件里出现了 ${parsed.week} 的食谱（${parsed.date}），已跳过。`)
      return
    }
    recipes.push(parsed)
  })

  if (value.recipes.length > 0 && recipes.length === 0) {
    console.error(`[leleat] ${expectedWeek} 的周食谱里没有通过校验的条目。`)
  }

  return recipes
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
    if (
      typeof item.mealPeriod !== 'string' ||
      !MEAL_PERIODS.includes(item.mealPeriod as MealPeriod)
    ) {
      return []
    }

    return [
      {
        date: item.date,
        mealPeriod: item.mealPeriod as MealPeriod,
        ...(typeof item.variantId === 'string' && item.variantId.trim()
          ? { variantId: item.variantId.trim() }
          : {}),
      },
    ]
  })
}

/** 解析同名菜下的配方变体；缺 variantId 或食材无效的变体丢弃。 */
function parseDishVariants(value: unknown): DishVariant[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    if (typeof item.variantId !== 'string' || !item.variantId.trim()) return []
    const ingredients = parseStringArray(item.ingredients)
    if (!ingredients || ingredients.length === 0) return []

    const firstSeen =
      typeof item.firstSeen === 'string' && parseIsoDate(item.firstSeen) ? item.firstSeen : ''
    const lastSeen =
      typeof item.lastSeen === 'string' && parseIsoDate(item.lastSeen) ? item.lastSeen : firstSeen

    return [
      {
        variantId: item.variantId.trim(),
        ingredients,
        riskAllergens: parseStringArray(item.riskAllergens) ?? [],
        count: typeof item.count === 'number' && item.count > 0 ? item.count : 1,
        firstSeen,
        lastSeen,
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

    const variants = parseDishVariants(rawDish.variants)
    const primaryVariantId =
      typeof rawDish.primaryVariantId === 'string' && rawDish.primaryVariantId.trim()
        ? rawDish.primaryVariantId.trim()
        : undefined
    const primaryBasis =
      rawDish.primaryBasis === 'latest' ||
      rawDish.primaryBasis === 'frequency' ||
      rawDish.primaryBasis === 'manual'
        ? rawDish.primaryBasis
        : undefined

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
      ...(variants.length > 0 ? { variants } : {}),
      ...(primaryVariantId ? { primaryVariantId } : {}),
      ...(primaryBasis ? { primaryBasis } : {}),
      ...(rawDish.needsReview === true ? { needsReview: true } : {}),
      ...(typeof rawDish.verified === 'boolean' ? { verified: rawDish.verified } : {}),
    }
  }

  const updatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(new Date(value.updatedAt).getTime())
      ? value.updatedAt
      : undefined

  return { dishes, ...(updatedAt ? { updatedAt } : {}) }
}

function parseSubstituteLibrary(value: unknown): SubstituteLibrary {
  if (!isRecord(value) || !Array.isArray(value.recipes)) {
    if (value !== null) warn('substitute-library.json 格式无效，使用旧版替餐映射。')
    return { recipes: [] }
  }

  const recipes: SubstituteRecipe[] = []
  const ids = new Set<string>()

  for (const [index, raw] of value.recipes.entries()) {
    if (!isRecord(raw)) {
      warn(`substitute-library.json recipes[${index}] 不是对象，已跳过。`)
      continue
    }

    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const replaces = parseStringArray(raw.replaces)
    const ingredients = parseStringArray(raw.ingredients) ?? []
    const usedFor = parseStringArray(raw.usedFor) ?? []
    const tags = parseStringArray(raw.tags) ?? []
    const mealPeriods = (parseStringArray(raw.mealPeriods) ?? []).filter(
      (period): period is MealPeriod => MEAL_PERIODS.includes(period as MealPeriod),
    )
    const categories = (parseStringArray(raw.categories) ?? []).filter(
      (category): category is DishCategory =>
        DISH_CATEGORIES.includes(category as DishCategory),
    )

    if (!id || !name || !replaces || replaces.length === 0) {
      warn(`substitute-library.json recipes[${index}] 缺少 id/name/replaces，已跳过。`)
      continue
    }
    if (ids.has(id)) {
      warn(`substitute-library.json 中 id "${id}" 重复，已跳过。`)
      continue
    }

    ids.add(id)
    recipes.push({
      id,
      name,
      replaces,
      ingredients,
      usedFor,
      tags,
      ...(mealPeriods.length > 0 ? { mealPeriods } : {}),
      ...(categories.length > 0 ? { categories } : {}),
      ...(typeof raw.verified === 'boolean' ? { verified: raw.verified } : {}),
      ...(typeof raw.priority === 'number' && Number.isFinite(raw.priority)
        ? { priority: raw.priority }
        : {}),
    })
  }

  const updatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(new Date(value.updatedAt).getTime())
      ? value.updatedAt
      : undefined

  return { recipes, ...(updatedAt ? { updatedAt } : {}) }
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

function parseIngredientIndex(value: unknown): IngredientIndex | null {
  if (!isRecord(value) || !isRecord(value.ingredients)) return null

  const ingredients: Record<string, IngredientRecord> = {}
  for (const [rawKey, rawRecord] of Object.entries(value.ingredients)) {
    if (!isRecord(rawRecord)) continue
    const name = rawKey.trim()
    if (!name) continue

    const hits = Array.isArray(rawRecord.hits)
      ? rawRecord.hits.flatMap((hit) => {
          if (!isRecord(hit)) return []
          if (typeof hit.dish !== 'string' || !hit.dish.trim()) return []
          if (typeof hit.date !== 'string' || !parseIsoDate(hit.date)) return []
          if (
            typeof hit.mealPeriod !== 'string' ||
            !MEAL_PERIODS.includes(hit.mealPeriod as MealPeriod)
          ) {
            return []
          }
          return [
            {
              ...(typeof hit.form === 'string' && hit.form.trim() ? { form: hit.form.trim() } : {}),
              dish: hit.dish.trim(),
              variantId: typeof hit.variantId === 'string' ? hit.variantId.trim() : '',
              date: hit.date,
              mealPeriod: hit.mealPeriod as MealPeriod,
            },
          ]
        })
      : []

    const forms = parseStringArray(rawRecord.forms) ?? [name]
    const dishes = parseStringArray(rawRecord.dishes) ?? []
    const dates = hits.map((hit) => hit.date).sort()

    ingredients[name] = {
      forms,
      dishCount: typeof rawRecord.dishCount === 'number' ? rawRecord.dishCount : dishes.length,
      hitCount: typeof rawRecord.hitCount === 'number' ? rawRecord.hitCount : hits.length,
      firstSeen:
        typeof rawRecord.firstSeen === 'string' && parseIsoDate(rawRecord.firstSeen)
          ? rawRecord.firstSeen
          : dates[0] ?? '',
      lastSeen:
        typeof rawRecord.lastSeen === 'string' && parseIsoDate(rawRecord.lastSeen)
          ? rawRecord.lastSeen
          : dates[dates.length - 1] ?? '',
      dishes,
      hits,
    }
  }

  const total = isRecord(value.total) ? value.total : {}
  const sumHits = Object.values(ingredients).reduce((n, record) => n + record.hitCount, 0)
  const updatedAt = parseUpdatedAt(value.updatedAt, 'ingredient-index.json')

  return {
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    total: {
      ingredients: Object.keys(ingredients).length,
      hits: typeof total.hits === 'number' ? total.hits : sumHits,
      dishes: typeof total.dishes === 'number' ? total.dishes : 0,
      variants: typeof total.variants === 'number' ? total.variants : 0,
    },
    ingredients,
    ...(updatedAt ? { updatedAt } : {}),
  }
}

/** 已加载过的周食谱，按周号缓存，避免同一周重复请求。 */
const weekCache = new Map<string, RecipeEntry[]>()
/** 正在进行的周请求，避免同一周被并发请求两次（切周很快时会碰到）。 */
const weekInFlight = new Map<string, Promise<RecipeEntry[]>>()

let ingredientIndexPromise: Promise<IngredientIndex | null> | null = null

/**
 * 按需加载食材索引（ingredient-index.json，约 150 KB）。
 * 只在需要「按食材反查菜谱/日期」时才调用，不进首屏。
 */
export function loadIngredientIndex(): Promise<IngredientIndex | null> {
  if (!ingredientIndexPromise) {
    ingredientIndexPromise = fetchOptionalJson('ingredient-index.json').then((raw) => {
      const parsed = parseIngredientIndex(raw)
      if (!parsed) warn('ingredient-index.json 不可用，按食材统计功能将不可用。')
      return parsed
    })
  }
  return ingredientIndexPromise
}

/** 读取整个静态数据包：只取 index.json 与公共配置，不包含任何一周的食谱。 */
export async function loadStaticData(): Promise<DataBundle> {
  const [
    rawIndex,
    rawAllergens,
    rawSubstitutes,
    rawSubstituteLibrary,
    rawSettings,
    rawDishCatalog,
  ] = await Promise.all([
    fetchJson('index.json', 'index', INDEX_ERROR),
    fetchJson('allergens.json', 'allergens', ALLERGENS_ERROR),
    fetchJson('substitutes.json', 'substitutes', SUBSTITUTES_ERROR),
    fetchOptionalJson('substitute-library.json'),
    fetchOptionalJson('settings.json'),
    fetchOptionalJson('dish-catalog.json'),
  ])

  const index = parseDataIndex(rawIndex)
  const updatedAt = parseUpdatedAt(isRecord(rawIndex) ? rawIndex.updatedAt : undefined, 'index.json')

  return {
    index,
    allergens: parseAllergens(rawAllergens),
    substitutes: parseSubstitutes(rawSubstitutes),
    substituteLibrary: parseSubstituteLibrary(rawSubstituteLibrary),
    settings: parseSettings(rawSettings),
    dishCatalog: parseDishCatalog(rawDishCatalog),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

/** 按需加载单周食谱（weeks/YYYY-Www.json），结果按周缓存，并发请求合并。 */
export function loadWeek(week: string): Promise<RecipeEntry[]> {
  const cached = weekCache.get(week)
  if (cached) return Promise.resolve(cached)

  if (!isIsoWeek(week)) {
    return Promise.reject(new DataLoadError('week', `周号 ${week} 不合法。`))
  }

  const pending = weekInFlight.get(week)
  if (pending) return pending

  const task = fetchJson(`weeks/${week}.json`, 'week', `${week} ${WEEK_ERROR}`)
    .then((raw) => {
      const recipes = parseWeekDocument(raw, week)
      weekCache.set(week, recipes)
      return recipes
    })
    .finally(() => {
      weekInFlight.delete(week)
    })

  weekInFlight.set(week, task)
  return task
}

/** 批量加载多周，用于导出「跨周自定义区间」。 */
export async function loadWeeks(weeks: string[]): Promise<RecipeEntry[]> {
  const unique = [...new Set(weeks)]
  const loaded = await Promise.all(unique.map((week) => loadWeek(week)))
  return loaded.flat()
}

/** 清空周缓存（测试或强制刷新用）。 */
export function clearWeekCache(): void {
  weekCache.clear()
  weekInFlight.clear()
}
