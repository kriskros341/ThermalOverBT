import React, { useRef, useState, useEffect } from 'react'
import { Editor as MdEditor } from '@toast-ui/react-editor'
import html2canvas from 'html2canvas'

export default function MarkdownPage({ refreshStatus }) {
  const mdRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [percent, setPercent] = useState(0)
  const [jobStatus, setJobStatus] = useState(null)

  const onPrint = async () => {
    const md = mdRef.current?.getInstance?.()
    if (!md) return
    try {
      setLoading(true)
      const html = md.getHTML()
      const container = document.createElement('div')
      container.style.width = '384px'
      container.style.padding = '8px'
      container.style.background = '#ffffff'
      container.style.color = '#000000'
      container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial'
      container.style.lineHeight = '1.3'
      container.style.position = 'fixed'
      container.style.left = '-10000px'
      container.style.top = '0'
      container.innerHTML = html
      document.body.appendChild(container)

      const canvas = await html2canvas(container, { backgroundColor: '#ffffff', scale: 2 })
      document.body.removeChild(container)
      const dataURL = canvas.toDataURL('image/png')
      const blob = await (await fetch(dataURL)).blob()
      const fd = new FormData()
      fd.append('file', blob, 'note.png')
      const res = await fetch('/print-async', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      const data = await res.json()
      setJobId(data.job_id)
      setJobStatus('queued')
    } catch (e) {
      alert('Print failed: ' + e.message)
    } finally {
      setLoading(false)
      refreshStatus?.()
    }
  }

  useEffect(() => {
    if (!jobId) return
    let stop = false
    const tick = async () => {
      try {
        const r = await fetch(`/jobs/${jobId}`)
        if (!r.ok) return
        const j = await r.json()
        setPercent(j.percent || 0)
        setJobStatus(j.status)
        if (j.status === 'done' || j.status === 'error') return
      } catch {}
      if (!stop) setTimeout(tick, 800)
    }
    tick()
    return () => { stop = true }
  }, [jobId])

  return (
    <div className="w-[760px] mx-auto">
      <div className="flex items-center gap-2 my-2">
        <button className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed" onClick={onPrint} disabled={loading || !mdRef.current}>Print</button>
      </div>
      {jobId && (
        <div className="my-2">
          <div className="text-sm text-gray-700 mb-1">Job {jobId} – {jobStatus} – {percent.toFixed(0)}%</div>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </div>
      )}
      <MdEditor
        ref={mdRef}
        initialEditType="markdown"
        previewStyle="vertical"
        height="720px"
        usageStatistics={false}
        placeholder="Write notes here…"
      />
    </div>
  )
}
