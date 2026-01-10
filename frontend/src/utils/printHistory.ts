export type PrintHistoryItem = {
  job_id: string
  created_at: number
  // Back-compat: older entries stored only filename
  filename?: string

  // New fields
  route?: string
  kind?: string
  summary?: string
  payload?: unknown
}

const STORAGE_KEY = 'phomemo.printHistory.v1'
const MAX_ITEMS = 50
const CHANGE_EVENT = 'phomemo:printHistory'

function emitChanged(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function getPrintHistory(): PrintHistoryItem[] {
  if (typeof window === 'undefined') return []
  const parsed = safeJsonParse<PrintHistoryItem[]>(window.localStorage.getItem(STORAGE_KEY))
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((x) => x && typeof (x as any).job_id === 'string' && typeof (x as any).created_at === 'number')
    .map((x) => {
      const item = x as PrintHistoryItem
      const filename = typeof item.filename === 'string' ? item.filename : undefined
      const route = typeof item.route === 'string' ? item.route : undefined
      const kind = typeof item.kind === 'string' ? item.kind : undefined
      const summary = typeof item.summary === 'string' ? item.summary : undefined
      return { ...item, filename, route, kind, summary }
    })
    .slice(0, MAX_ITEMS)
}

export function appendPrintHistory(item: Omit<PrintHistoryItem, 'created_at'> & { created_at?: number }): void {
  if (typeof window === 'undefined') return
  const created_at = item.created_at ?? Date.now()
  const nextItem: PrintHistoryItem = {
    job_id: item.job_id,
    created_at,
    filename: item.filename,
    route: item.route,
    kind: item.kind,
    summary: item.summary,
    payload: item.payload,
  }

  const curr = getPrintHistory()
  const deduped = curr.filter((x) => x.job_id !== nextItem.job_id)
  const next = [nextItem, ...deduped].slice(0, MAX_ITEMS)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    emitChanged()
  } catch {
    // ignore quota / disabled storage
  }
}

export function summarizeText(text: string, maxLen = 120): string {
  const s = (text || '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

export function limitPayloadString(s: string, maxLen = 20000): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen)
}

export function clearPrintHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    emitChanged()
  } catch {
    // ignore
  }
}

export function onPrintHistoryChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
