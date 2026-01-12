/**
 * Access object value by path with dot/bracket notation, e.g., user.name, items[0].title.
 * Missing values return undefined.
 */
export function getByPath(obj: any, path: string): any {
  try {
    if (path == null || path === '') return ''
    const norm = path.replace(/\[(\d+)\]/g, '.$1')
    return norm.split('.').reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj)
  } catch {
    return undefined
  }
}

/**
 * Replace {{ path.to.value }} placeholders with values from data.
 */
export function renderTemplate(template: string, data: any): string {
  if (!template) return ''
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (_m, p1) => {
    const val = getByPath(data, String(p1).trim())
    if (val == null) return ''
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  })
}
