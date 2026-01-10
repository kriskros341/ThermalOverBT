import React, { useRef, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
// import remarkGfm from 'remark-gfm'
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
import { useLocation, useNavigate } from 'react-router-dom'
import { limitPayloadString, summarizeText } from '../utils/printHistory'

type Props = { refreshStatus?: () => Promise<void> }

export default function MarkdownPage({ refreshStatus }: Props) {
  const [markdown, setMarkdown] = useState<string>('')
  const location = useLocation()
  const navigate = useNavigate()
  const lastRestoreJobIdRef = useRef<string | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const mdRef = useRef<any>(null)
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [percent, setPercent] = useState(0)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const canvasMountRef = useRef<HTMLDivElement | null>(null)
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null)

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
  };

  const sendToPrinter = async () => {
    try {
      if (!previewCanvas) return
      setLoading(true)
      const blob = await canvasToPngBlob(previewCanvas)
      const trimmed = markdown.trim()
      const { job_id } = await postImageToPrinter(blob, 'note.png', {
        route: '/markdown',
        kind: 'markdown',
        summary: summarizeText(trimmed),
        payload: { markdown: limitPayloadString(trimmed) },
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
  };
  // Mount the returned canvas element into the preview modal container
  useEffect(() => {
    if (!showPreview) return
    const mount = canvasMountRef.current
    if (!mount) return
    if (previewCanvas) {
      mountCanvasIn(mount, previewCanvas, PRINTER_WIDTH_PX)
    }
  }, [previewCanvas, showPreview])

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
  }, [jobId]);


  useEffect(() => {
    ensureTailwindCdn()
  }, [])

  // Restore from global history (navigation state)
  useEffect(() => {
    const restore = (location.state as any)?.restore as any
    if (!restore || restore.kind !== 'markdown') return
    if (restore.job_id && lastRestoreJobIdRef.current === restore.job_id) return
    const nextMd = String(restore?.payload?.markdown ?? '')
    setMarkdown(nextMd)
    try {
      const inst = mdRef.current?.getInstance?.()
      inst?.setMarkdown?.(nextMd)
    } catch {}
    lastRestoreJobIdRef.current = restore.job_id ?? null
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  return (
    <div className="w-[760px] mx-auto">
      <div className="flex items-center gap-2 my-2">
        <button
          className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onPrint}
          disabled={loading || !markdown}
        >
          Print
        </button>
      </div>

      {showPreview && (
        <div className="print-preview fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-[95vw] p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Print Preview</h2>
              <p className="text-xs text-gray-600">Review the captured canvas before sending to the printer.</p>
            </div>
            <div className="border rounded-md overflow-auto max-h-[70vh] flex items-center justify-center p-2 bg-gray-50">
              {/* Mount actual canvas for pixel-perfect preview */}
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

      <div className="flex gap-4">
        <div className="w-1/2">
          <MdEditor
            ref={mdRef as any}
            initialValue={markdown}
            initialEditType="markdown"
            previewStyle="tab"
            height="720px"
            usageStatistics={false}
            placeholder="Write notes here…"
            onChange={() => {
              try {
                const inst = mdRef.current?.getInstance?.()
                const md = inst?.getMarkdown?.() ?? inst?.getValue?.() ?? ''
                setMarkdown(md)
              } catch {
                // ignore
              }
            }}
          />
        </div>

        <div className="prose w-1/2 h-[720px] outline outline-[#dadde6] rounded-md p-2">
          <div ref={previewRef} className="">
            <ReactMarkdown
              // remarkPlugins={[remarkGfm]}
              // rehypePlugins={[rehypeRaw, rehypeSanitize]}
              rehypePlugins={[rehypeRaw]}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
