import { domToCanvas } from 'modern-screenshot'
import { appendPrintHistory } from './printHistory'

export type PrintHistoryMeta = {
  route?: string
  kind?: string
  summary?: string
  payload?: unknown
}

export const PRINTER_WIDTH_PX = 384

/** Ensure Tailwind CDN is available once per document */
export function ensureTailwindCdn(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('tailwind-cdn')) return
  const script = document.createElement('script')
  script.id = 'tailwind-cdn'
  script.src = 'https://cdn.tailwindcss.com'
  script.defer = true
  document.head.appendChild(script)
}

/**
 * Capture the given element by cloning it into an offscreen container and rendering to canvas.
 * Applies SVG border fix and ensures a stable layout before capture.
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  widthPx: number = PRINTER_WIDTH_PX,
  scale: number = 2,
  options?: { background?: string }
): Promise<HTMLCanvasElement> {
  // Deep clone to avoid mutating on-screen DOM
  const clone = element.cloneNode(true) as HTMLElement

  // Invisible in-viewport wrapper (avoid offscreen culling by screenshot libs)
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '0'
  container.style.top = '0'
  container.style.opacity = '0'
  container.style.pointerEvents = 'none'
  container.style.zIndex = '-1'
  container.style.width = `${widthPx}px`
  container.style.background = options?.background ?? '#ffffff'
  container.className = 'print-preview prose prose-sm max-w-none'
  container.style.fontSize = '32px'

  // Ensure clone width locks to printer width
  clone.style.width = `${widthPx}px`
  clone.style.boxSizing = 'border-box'
  // clone.style.padding = '8px';
  container.appendChild(clone)
  document.body.appendChild(container)

  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

  try {
    const canvas = await domToCanvas(clone, {
      backgroundColor: options?.background ?? '#ffffff',
      scale,
    })
    return canvas
  } finally {
    document.body.removeChild(container)
  }
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const dataURL = canvas.toDataURL('image/png')
  const res = await fetch(dataURL)
  return await res.blob()
}

export async function postImageToPrinter(
  blob: Blob,
  filename = 'print.png',
  meta?: PrintHistoryMeta
): Promise<{ job_id: string }> {
  const fd = new FormData()
  fd.append('file', blob, filename)
  const res = await fetch('/print-async', { method: 'POST', body: fd })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || res.statusText)
  }
  const data = await res.json()
  const job_id = (data as any).job_id as string
  appendPrintHistory({ job_id, filename, ...meta })
  return { job_id }
}

export function mountCanvasIn(mount: HTMLElement, canvas: HTMLCanvasElement, widthPx: number = PRINTER_WIDTH_PX) {
  mount.innerHTML = ''
  canvas.style.width = `${widthPx}px`
  canvas.style.height = 'auto'
  mount.appendChild(canvas)
}
