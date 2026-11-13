import { createHash } from 'node:crypto'

/**
 * 菜名 + 食材集合 → 稳定的变体 ID。
 * 口径：只按「食材集合」判等，忽略顺序与重复（同一菜名的同一天多次入库不会产生假变体）。
 * 例：豆沙卷 + 红豆/面粉/白糖 → `豆沙卷#a1b2c3d4`
 */
export function normalizeIngredients(ingredients) {
  return [...new Set((ingredients ?? []).map((item) => String(item).trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, 'zh-CN'),
  )
}

export function variantIdFor(name, ingredients) {
  const key = `${String(name).trim()}|${normalizeIngredients(ingredients).join('/')}`
  const digest = createHash('sha1').update(key, 'utf8').digest('hex')
  return `${String(name).trim()}#${digest.slice(0, 8)}`
}

export function sortByChinese(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}
