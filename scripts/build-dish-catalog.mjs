import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const recipesPath = resolve(root, 'public/assets/data/recipes.json')
const catalogPath = resolve(root, 'public/assets/data/dish-catalog.json')

const document = JSON.parse(await readFile(recipesPath, 'utf8'))
const recipes = Array.isArray(document) ? document : document.recipes
const updatedAt = Array.isArray(document)
  ? new Date().toISOString()
  : document.updatedAt ?? new Date().toISOString()

let previous = { dishes: {} }
try {
  previous = JSON.parse(await readFile(catalogPath, 'utf8'))
} catch {
  // 首次生成时没有旧目录。
}

const dishes = {}

for (const entry of recipes) {
  for (const dish of entry.dishes ?? []) {
    const key = String(dish.name ?? '').trim()
    if (!key) continue

    const prior = previous.dishes?.[key]
    const current = dishes[key] ?? {
      name: key,
      aliases: [...(prior?.aliases ?? [])],
      ingredients: [...(prior?.ingredients ?? [])],
      riskAllergens: [...(prior?.riskAllergens ?? [])],
      substitute: prior?.substitute ?? null,
      firstSeen: prior?.firstSeen ?? entry.date,
      lastSeen: prior?.lastSeen ?? entry.date,
      occurrences: [...(prior?.occurrences ?? [])],
      sourceImages: [...(prior?.sourceImages ?? [])],
      ...(typeof prior?.verified === 'boolean' ? { verified: prior.verified } : {}),
    }

    for (const ingredient of dish.ingredients ?? []) {
      if (!current.ingredients.includes(ingredient)) current.ingredients.push(ingredient)
    }
    for (const allergen of dish.riskAllergens ?? []) {
      if (!current.riskAllergens.includes(allergen)) current.riskAllergens.push(allergen)
    }
    if (!current.substitute && typeof dish.substitute === 'string' && dish.substitute.trim()) {
      current.substitute = dish.substitute.trim()
    }

    current.firstSeen = current.firstSeen < entry.date ? current.firstSeen : entry.date
    current.lastSeen = current.lastSeen > entry.date ? current.lastSeen : entry.date

    const occurrenceExists = current.occurrences.some(
      (occurrence) =>
        occurrence.date === entry.date && occurrence.mealPeriod === entry.mealPeriod,
    )
    if (!occurrenceExists) {
      current.occurrences.push({
        date: entry.date,
        week: entry.week,
        mealPeriod: entry.mealPeriod,
        mealLabel: entry.mealLabel,
      })
    }
    if (entry.sourceImage && !current.sourceImages.includes(entry.sourceImage)) {
      current.sourceImages.push(entry.sourceImage)
    }

    dishes[key] = current
  }
}

const sorted = Object.fromEntries(
  Object.entries(dishes).sort(([, left], [, right]) => left.name.localeCompare(right.name, 'zh-CN')),
)

await writeFile(
  catalogPath,
  `${JSON.stringify({ updatedAt, dishes: sorted }, null, 2)}\n`,
  'utf8',
)

console.log(`[leleat] dish catalog: ${Object.keys(sorted).length} dishes -> ${catalogPath}`)
