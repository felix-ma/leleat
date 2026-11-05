const EXTERNAL_URL_RE = /^(?:[a-z]+:)?\/\//i

/**
 * 将仓库内静态资源路径转换为带 Vite base 的 URL。
 * 已部署在 /leleat/ 下，避免硬编码本地或域名路径。
 */
export function withBase(path: string): string {
  if (!path) return ''
  if (EXTERNAL_URL_RE.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path
  }

  const base = import.meta.env.BASE_URL
  return `${base}${path.replace(/^\/+/, '')}`
}

export function resolveAssetUrl(path: string): string {
  return withBase(path)
}
