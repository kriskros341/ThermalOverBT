import React, { useRef, useState, useEffect } from 'react'
import ImageEditor from '@toast-ui/react-image-editor'
import { postImageToPrinter } from '../utils/printHelpers'
import { summarizeText } from '../utils/printHistory'

const menus = ['crop','flip','rotate','draw','shape','icon','text','filter']

type Props = { refreshStatus?: () => Promise<void> }

export default function ImagePage({ refreshStatus }: Props) {
  const editorRef = useRef<any>(null)
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [percent, setPercent] = useState(0)
  const [jobStatus, setJobStatus] = useState<string | null>(null)

  const loadFileToEditor = (f: File) => {
    if (!f) return
    const url = URL.createObjectURL(f)
    const editor = editorRef.current?.getInstance?.()
    if (!editor) return
    editor.loadImageFromURL(url, f.name || 'upload').then(() => {
      const dims = editor.getCanvasSize()
      editor.ui.resizeEditor({
        width: Math.min((dims.width || 700), window.innerWidth - 40),
        height: Math.min(((dims.height || 500) + 120), window.innerHeight - 140)
      })
      URL.revokeObjectURL(url)
    }).catch(() => URL.revokeObjectURL(url))
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) loadFileToEditor(f)
  }

  const onPrint = async () => {
    const editor = editorRef.current?.getInstance?.()
    if (!editor) return
    try {
      setLoading(true)
      const dataURL = editor.toDataURL({ format: 'png' })
      const blob = await (await fetch(dataURL)).blob()
      const { job_id } = await postImageToPrinter(blob, 'image.png', {
        route: '/image',
        kind: 'image',
        summary: summarizeText('Image'),
      })
      setJobId(job_id)
      setJobStatus('queued')
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
      refreshStatus?.()
    }
  }

  // Poll job progress
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

  return (
    <div>
      <div className="flex items-center gap-2 my-2">
        <label className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 cursor-pointer">
          Choose image
          <input className="hidden" type="file" accept="image/*" onChange={onFileChange} />
        </label>
        <button className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed" onClick={onPrint} disabled={loading || !editorRef.current}>Print</button>
      </div>
      {jobId && (
        <div className="my-2">
          <div className="text-sm text-gray-700 mb-1">Job {jobId} – {jobStatus} – {percent.toFixed(0)}%</div>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </div>
      )}
      <ImageEditor
        ref={editorRef as any}
        includeUI={{
          menu: menus as any,
          uiSize: { width: '100%', height: '720px' },
          menuBarPosition: 'bottom',
          loadImage: { path: '', name: '' },
        }}
        cssMaxWidth={900}
        cssMaxHeight={800}
        selectionStyle={{ cornerSize: 20, rotatingPointOffset: 70 } as any}
        usageStatistics={false}
      />
    </div>
  )
}
