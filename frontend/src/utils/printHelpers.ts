import { domToCanvas } from 'modern-screenshot'

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

  // Fix borders in SVG during capture
  const borderStyleFix = document.createElement('style')
  // borderStyleFix.innerHTML = `.print-preview * { box-sizing: border-box; border: none; } .print-preview { border: none; }`
  container.appendChild(borderStyleFix)

  // Ensure clone width locks to printer width
  clone.style.width = `${widthPx}px`
  clone.style.boxSizing = 'border-box'
  clone.style.padding = '8px';
  container.appendChild(clone)
  document.body.appendChild(container)

  // Wait a frame so styles/layout apply
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

  // Ensure images in the cloned subtree are loaded before capture
  // const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  // if (imgs.length) {
  //   await Promise.race([
  //     Promise.all(
  //       imgs.map((img) =>
  //         img.complete && img.naturalWidth > 0
  //           ? Promise.resolve()
  //           : new Promise<void>((res) => {
  //               const onDone = () => {
  //                 img.removeEventListener('load', onDone)
  //                 img.removeEventListener('error', onDone)
  //                 res()
  //               }
  //               img.addEventListener('load', onDone)
  //               img.addEventListener('error', onDone)
  //             })
  //       )
  //     ),
  //     // Safety timeout so we still render if an image hangs
  //     new Promise((res) => setTimeout(res, 1500)),
  //   ])
  // }

  try {
    // Capture the cloned element directly
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

export async function postImageToPrinter(blob: Blob, filename = 'print.png'): Promise<{ job_id: string }> {
  const fd = new FormData()
  fd.append('file', blob, filename)
  const res = await fetch('/print-async', { method: 'POST', body: fd })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || res.statusText)
  }
  const data = await res.json()
  return { job_id: (data as any).job_id as string }
}

export function mountCanvasIn(mount: HTMLElement, canvas: HTMLCanvasElement, widthPx: number = PRINTER_WIDTH_PX) {
  mount.innerHTML = ''
  canvas.style.width = `${widthPx}px`
  canvas.style.height = 'auto'
  mount.appendChild(canvas)
}
