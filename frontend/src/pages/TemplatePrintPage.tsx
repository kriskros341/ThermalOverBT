import React, { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { Editor as MdEditor } from '@toast-ui/react-editor'

/**
 * Simple templating: replaces {{ path.to.value }} with the corresponding value from the data object.
 * Supports dot and bracket notation (e.g., user.name, items[0].title). Missing values become ''.
 */
function getByPath(obj: any, path: string): any {
  try {
    if (path == null || path === '') return ''
    // Normalize bracket notation: items[0].name -> items.0.name
    const norm = path.replace(/\[(\d+)\]/g, '.$1')
    return norm.split('.').reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj)
  } catch {
    return undefined
  }
}

function renderTemplate(template: string, data: any): string {
  if (!template) return ''
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (_m, p1) => {
    const val = getByPath(data, String(p1).trim())
    if (val == null) return ''
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  })
}

type Props = { refreshStatus?: () => Promise<void> }

export default function TemplatePrintPage({ refreshStatus }: Props) {
  const [dataText, setDataText] = useState<string>(`[
  { "name": "Alice", "qty": 2, "price": 4.5 },
  { "name": "Bob", "qty": 1, "price": 9.99 }
]`)
  const [templateText, setTemplateText] = useState<string>("# Order Line\n\n- Product: **{{ name }}**\n- Qty: {{ qty }}\n- Price: ${{ price }}\n\n---\n")

  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [percent, setPercent] = useState(0)
  const [jobStatus, setJobStatus] = useState<string | null>(null)

  const [showPreview, setShowPreview] = useState(false)
  const canvasMountRef = useRef<HTMLDivElement | null>(null)
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null)

  const previewRef = useRef<HTMLDivElement | null>(null)
  const mdRef = useRef<any>(null)

  const dataArray: any[] = useMemo(() => {
    try {
      const parsed = JSON.parse(dataText)
      if (!Array.isArray(parsed)) {
        setParseError('Data must be a JSON array of objects')
        return []
      }
      setParseError(null)
      return parsed
    } catch (e: any) {
      setParseError(e?.message ?? 'Invalid JSON')
      return []
    }
  }, [dataText])

  const onPrint = async () => {
    if (!previewRef.current) return
    try {
      setLoading(true)

      // Clone the entire preview region (which already renders all rows)
      const clone = previewRef.current.cloneNode(true) as HTMLElement

      // Wrap offscreen for capture at printer width
      const container = document.createElement('div')
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.width = '384px' // Printer width

      container.appendChild(clone)
      document.body.appendChild(container)

      // Render a high-res canvas
      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        scrollY: -window.scrollY,
        useCORS: true,
      })

      document.body.removeChild(container)
      setPreviewCanvas(canvas)
      setShowPreview(true)
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
    }
  }

  const sendToPrinter = async () => {
    try {
      if (!previewCanvas) return
      setLoading(true)
      const dataURL = previewCanvas.toDataURL('image/png')
      const blob = await (await fetch(dataURL)).blob()
      const fd = new FormData()
      fd.append('file', blob, 'batch.png')

      const res = await fetch('/print-async', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }

      const data = await res.json()
      setJobId((data as any).job_id as string)
      setJobStatus('queued')
      setShowPreview(false)
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
      refreshStatus?.()
    }
  }

  // Mount the returned canvas element into the preview modal container
  useEffect(() => {
    if (!showPreview) return
    const mount = canvasMountRef.current
    if (!mount) return
    mount.innerHTML = ''
    if (previewCanvas) {
      previewCanvas.style.width = '384px'
      previewCanvas.style.height = 'auto'
      mount.appendChild(previewCanvas)
    }
  }, [previewCanvas, showPreview])

  // Poll job status
  useEffect(() => {
    if (!jobId) return
    let stop = false
    const tick = async () => {
      try {
        const r = await fetch(`/jobs/${jobId}`)
        if (!r.ok) return
        const j = await r.json()
        setPercent((j as any).percent || 0)
        setJobStatus((j as any).status)
        if ((j as any).status === 'done' || (j as any).status === 'error') return
      } catch {}
      if (!stop) setTimeout(tick, 800)
    }
    tick()
    return () => { stop = true }
  }, [jobId])

  // Ensure Tailwind available for html2canvas capture context
  useEffect(() => {
    if (document.getElementById('tailwind-cdn')) return
    const script = document.createElement('script')
    script.id = 'tailwind-cdn'
    script.src = 'https://cdn.tailwindcss.com'
    script.defer = true
    document.head.appendChild(script)
  }, [])

  return (
    <div className="w-[980px] mx-auto">
      <div className="flex items-center gap-2 my-2">
        <button
          className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onPrint}
          disabled={loading || !templateText || dataArray.length === 0 || !!parseError}
        >
          Print
        </button>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-[95vw] p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Print Preview</h2>
              <p className="text-xs text-gray-600">This canvas contains all templated rows stacked vertically.</p>
            </div>
            <div className="border rounded-md overflow-auto max-h-[70vh] flex items-center justify-center p-2 bg-gray-50">
              <div ref={canvasMountRef} className="[&>canvas]:block [&>canvas]:mx-auto" />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setShowPreview(false)}
                disabled={loading}
              >
                Close
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-md border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={sendToPrinter}
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send to printer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {jobId && (
        <div className="my-2">
          <div className="text-sm text-gray-700 mb-1">Job {jobId} – {jobStatus} – {percent.toFixed(0)}%</div>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Data editor */}
        <div className="min-h-[720px]">
          <div className="mb-2 text-sm font-medium">Data (JSON array)</div>
          <textarea
            className="w-full h-[720px] outline outline-[#dadde6] rounded-md p-2 font-mono text-sm"
            value={dataText}
            onChange={(e) => setDataText(e.target.value)}
            spellCheck={false}
          />
          {parseError ? (
            <div className="mt-1 text-xs text-red-600">{parseError}</div>
          ) : (
            <div className="mt-1 text-xs text-gray-500">{dataArray.length} items</div>
          )}
        </div>

        {/* Template editor + live preview for first item */}
        <div className="">
          <div className="mb-2 text-sm font-medium">Template (Markdown with {'{{}}'} placeholders)</div>
          <MdEditor
            ref={mdRef as any}
            initialValue={templateText}
            initialEditType="markdown"
            previewStyle="tab"
            height="360px"
            usageStatistics={false}
            placeholder="Write template here… Use {{ field }} placeholders."
            onChange={() => {
              try {
                const inst = mdRef.current?.getInstance?.()
                const md = inst?.getMarkdown?.() ?? inst?.getValue?.() ?? ''
                setTemplateText(md)
              } catch {}
            }}
          />

          <div className="mt-3 mb-1 text-sm font-medium">Live preview (first item)</div>
          <div className="outline outline-[#dadde6] rounded-md p-2">
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
              {dataArray.length > 0 ? renderTemplate(templateText, dataArray[0]) : ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Hidden render root used for print capture */}
      <div className="sr-only">
        <div ref={previewRef} className="w-[384px]">
          {dataArray.map((row, idx) => (
            <div key={idx} className="pb-2 mb-2 last:mb-0 last:pb-0 border-b border-dashed border-gray-300 last:border-0">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                {renderTemplate(templateText, row)}
              </ReactMarkdown>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
