import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { Editor as MdEditor } from '@toast-ui/react-editor'
import {
  PRINTER_WIDTH_PX,
  ensureTailwindCdn,
  captureElementToCanvas,
  canvasToPngBlob,
  postImageToPrinter,
  mountCanvasIn,
} from '../utils/printHelpers'
import { renderTemplate } from '../utils/template'
import { useLocation, useNavigate } from 'react-router-dom'
import { limitPayloadString, summarizeText } from '../utils/printHistory'


type Props = { refreshStatus?: () => Promise<void> }

export default function TemplatePrintPage({ refreshStatus }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const lastRestoreJobIdRef = useRef<string | null>(null)
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

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

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

      const canvas = await captureElementToCanvas(previewRef.current, PRINTER_WIDTH_PX, 2)
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
      const blob = await canvasToPngBlob(previewCanvas)
      const { job_id } = await postImageToPrinter(blob, 'batch.png', {
        route: '/template',
        kind: 'template',
        summary: summarizeText(templateText),
        payload: {
          templateText: limitPayloadString(templateText),
          dataText: limitPayloadString(dataText),
        },
      })
      setJobId(job_id)
      setJobStatus('queued')
      setShowPreview(false)
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
      refreshStatus?.()
    }
  }

  const executeTemplateImport = (text: string) => {
    // Support multiple formats:
    // 1) ```<script> ... </script>```
    // 2) ```json ... ``` or ```js ... ```
    // 3) <script> ... </script>
    const patterns: RegExp[] = [
      /```\s*<script(?:\s[^>]*)?>([\s\S]*?)<\/script>\s*```/i,
      /```(?:json|js|javascript)\s+([\s\S]*?)```/i,
      /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i,
    ]

    let match: RegExpExecArray | null = null
    let usedPattern: RegExp | null = null
    for (const re of patterns) {
      const m = re.exec(text)
      if (m && m[1]) {
        match = m
        usedPattern = re
        break
      }
    }

    if (match && usedPattern) {
      const dataPart = match[1].trim()
      const templatePart = text.replace(match[0], '').trim()
      setDataText(dataPart)
      setTemplateText(templatePart)
      const inst = mdRef.current?.getInstance?.()
      inst.setMarkdown(templatePart)
      setShowImport(false)
    } else {
      alert('No valid data found in import text.')
    }
  }

  // Mount the returned canvas element into the preview modal container
  useEffect(() => {
    if (!showPreview) return
    const mount = canvasMountRef.current
    if (!mount) return
    if (previewCanvas) {
      mountCanvasIn(mount, previewCanvas, PRINTER_WIDTH_PX)
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
    ensureTailwindCdn()
  }, [])

  // Restore from global history (navigation state)
  useEffect(() => {
    const restore = (location.state as any)?.restore as any
    if (!restore || restore.kind !== 'template') return
    if (restore.job_id && lastRestoreJobIdRef.current === restore.job_id) return
    const nextTemplate = String(restore?.payload?.templateText ?? '')
    const nextData = String(restore?.payload?.dataText ?? '')
    if (nextData) setDataText(nextData)
    if (nextTemplate) {
      setTemplateText(nextTemplate)
      try {
        const inst = mdRef.current?.getInstance?.()
        inst?.setMarkdown?.(nextTemplate)
      } catch {}
    }
    lastRestoreJobIdRef.current = restore.job_id ?? null
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

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
        <button
          className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={() => setShowImport(true)}
        >
          Importuj
        </button>
      </div>

      {showPreview && (
        <div className="print-preview fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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

      {showImport && (
        <div className="print-preview fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="max-h-[75vh] bg-white rounded-lg shadow-xl w-[420px] max-w-[95vw] p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Importuj</h2>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Zawartość</div>
              <textarea
                className="w-full outline outline-[#dadde6] rounded-md p-2 font-mono text-sm"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setShowImport(false)}
              >
                Zamknij
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-md border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={() => executeTemplateImport(importText)}
              >
                Importuj
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

          <div className="mt-3 mb-1 text-sm font-medium">Live preview ({`${dataArray.length > 1 ? `first two items` : 'first item'}`} )</div>
          <div className="outline outline-[#dadde6] rounded-md p-2 prose prose-sm max-w-none">
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
              {dataArray.length > 0 ? `${renderTemplate(templateText, dataArray[0])} ${dataArray[1] ? renderTemplate(templateText, dataArray[1]) : ''}` : ''}
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
