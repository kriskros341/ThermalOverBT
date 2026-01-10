import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  PRINTER_WIDTH_PX,
  ensureTailwindCdn,
  captureElementToCanvas,
  canvasToPngBlob,
  postImageToPrinter,
  mountCanvasIn,
} from '../utils/printHelpers'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isValid,
  max as maxDate,
  min as minDate,
  parse,
  startOfMonth,
} from 'date-fns'
import { pl } from 'date-fns/locale'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { summarizeText } from '../utils/printHistory'

// Small helper: Monday-first offset (0-6)
function mondayOffset(date: Date): number {
  const dow = getDay(date) // 0=Sun..6=Sat
  return (dow + 6) % 7 // shift so Mon=0
}

// Generate inclusive months between start and end
function* iterateMonths(start: Date, end: Date): Generator<Date> {
  let cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    yield cur
    cur = addMonths(cur, 1)
  }
}

type Props = { refreshStatus?: () => Promise<void> }

export default function CalendarPage({ refreshStatus }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const lastRestoreJobIdRef = useRef<string | null>(null)
  // Default to current month
  const now = new Date()
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), 1)

  const [searchParams, setSearchParams] = useSearchParams()
  // Parse helper to accept dd.MM.yyyy or dd/MM/yyyy
  const parseEu = (s: string) => {
    const t = s.trim()
    const normalized = t.replace(/\//g, '.')
    const a = parse(normalized, 'dd.MM.yyyy', new Date())
    return a
  }

  const [startStr, setStartStr] = useState<string>(() => {
    const p = searchParams.get('start')
    if (p) {
      const d = parseEu(p)
      if (isValid(d)) return format(d, 'dd.MM.yyyy')
    }
    return format(defaultStart, 'dd.MM.yyyy')
  })
  const [endStr, setEndStr] = useState<string>(() => {
    const p = searchParams.get('end')
    if (p) {
      const d = parseEu(p)
      if (isValid(d)) return format(d, 'dd.MM.yyyy')
    }
    return format(defaultEnd, 'dd.MM.yyyy')
  })

  const startDate = useMemo(() => parseEu(startStr), [startStr])
  const endDate = useMemo(() => parseEu(endStr), [endStr])

  const validRange = isValid(startDate) && isValid(endDate) && !isAfter(startDate, endDate)

  // Print preview state
  const previewRef = useRef<HTMLDivElement | null>(null)
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
      const canvas = await captureElementToCanvas(previewRef.current as HTMLElement, PRINTER_WIDTH_PX, 2)
      // No rotation – use the captured canvas directly (width fits printer width)
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
      const rangeText = `${startStr} – ${endStr}`
      const { job_id } = await postImageToPrinter(blob, 'calendar.png', {
        route: '/calendar',
        kind: 'calendar',
        summary: summarizeText(rangeText),
        payload: { startStr, endStr },
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

  // Mount canvas into preview modal
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

  useEffect(() => { ensureTailwindCdn() }, [])

  // Restore from global history (navigation state)
  useEffect(() => {
    const restore = (location.state as any)?.restore as any
    if (!restore || restore.kind !== 'calendar') return
    if (restore.job_id && lastRestoreJobIdRef.current === restore.job_id) return
    const nextStart = String(restore?.payload?.startStr ?? '')
    const nextEnd = String(restore?.payload?.endStr ?? '')
    if (nextStart) setStartStr(nextStart)
    if (nextEnd) setEndStr(nextEnd)
    lastRestoreJobIdRef.current = restore.job_id ?? null
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Reflect local state into URL search params (replace to avoid history spam)
  useEffect(() => {
    const currStart = searchParams.get('start') ?? ''
    const currEnd = searchParams.get('end') ?? ''
    if (currStart !== startStr || currEnd !== endStr) {
      const next = new URLSearchParams(searchParams)
      if (startStr) next.set('start', startStr); else next.delete('start')
      if (endStr) next.set('end', endStr); else next.delete('end')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr])

  // Reflect URL changes (back/forward) back into local state
  useEffect(() => {
    const pStart = searchParams.get('start') || ''
    const pEnd = searchParams.get('end') || ''
    if (pStart && pStart !== startStr) {
      const d = parseEu(pStart)
      if (isValid(d)) setStartStr(format(d, 'dd.MM.yyyy'))
    }
    if (pEnd && pEnd !== endStr) {
      const d = parseEu(pEnd)
      if (isValid(d)) setEndStr(format(d, 'dd.MM.yyyy'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Compute months to render (inclusive), clamped to valid order
  const range = useMemo(() => {
    if (!validRange) return [] as Date[]
    // clamp days to 1st of month for iteration
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
    const list: Date[] = []
    const startM = minDate([s, e])
    const endM = maxDate([s, e])
    for (const m of iterateMonths(startM, endM)) list.push(m)
    return list
  }, [validRange, startDate, endDate])

  return (
    <div className="w-[980px] mx-auto">
      <div className="flex flex-wrap items-end gap-3 my-2">
        <div className="flex flex-col">
          <label className="text-sm text-gray-700">Start date</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd.MM.yyyy"
            className="px-2 py-1 rounded-md border border-gray-300"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            onBlur={(e) => {
              const d = parseEu(e.target.value)
              if (isValid(d)) setStartStr(format(d, 'dd.MM.yyyy'))
            }}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-700">End date</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd.MM.yyyy"
            className="px-2 py-1 rounded-md border border-gray-300"
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            onBlur={(e) => {
              const d = parseEu(e.target.value)
              if (isValid(d)) setEndStr(format(d, 'dd.MM.yyyy'))
            }}
          />
        </div>
        <button
          className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onPrint}
          disabled={loading || !validRange || range.length === 0}
        >
          Print
        </button>
      </div>

      {!validRange && (
        <div className="text-sm text-red-700 mb-2">Please choose a valid date range (start must be before or equal to end).</div>
      )}

      {jobId && (
        <div className="my-2">
          <div className="text-sm text-gray-700 mb-1">Job {jobId} – {jobStatus} – {percent.toFixed(0)}%</div>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </div>
      )}

      {/* On-screen preview of the first month(s) */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-6">
        {range.slice(0, 2).map((monthDate, idx) => (
          <div key={idx}>
            <MonthGrid
              monthDate={monthDate}
              startDate={startDate}
              endDate={endDate}
              gridClassName="grid grid-cols-7 gap-1 w-[85mm] mx-auto mt-2 text-sm"
              dayTextClassName="text-xs font-bold"
              boxClassName="w-3 h-3 border-2 border-gray-900"
            />
          </div>
        ))}
      </div>

      {/* Print capture root: all months stacked for printing */}
      <div className="sr-only">
        <div ref={previewRef} className="w-[384px]">
          {range.map((monthDate, idx) => (
            <div key={`m-${idx}`} className="pb-3 mb-3 last:mb-0 last:pb-0 border-b border-dashed border-gray-300 last:border-0">
              <MonthGrid
                monthDate={monthDate}
                startDate={startDate}
                endDate={endDate}
                gridClassName="grid grid-cols-7 gap-1 w-[85mm] mx-auto mt-2 text-[11px]"
                dayTextClassName="text-xs font-bold"
                boxClassName="w-3 h-3 border-2 border-gray-900"
              />
            </div>
          ))}
        </div>
      </div>

      {showPreview && (
        <div className="print-preview fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-[95vw] p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold">Print Preview</h2>
              <p className="text-xs text-gray-600">Review the captured canvas before sending to the printer.</p>
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
    </div>
  )
}

type MonthGridProps = {
  monthDate: Date
  startDate: Date
  endDate: Date
  gridClassName?: string
  dayTextClassName?: string
  boxClassName?: string
}

function MonthGrid({ monthDate, startDate, endDate, gridClassName, dayTextClassName = 'text-xs', boxClassName = 'w-3 h-3 border-2 border-gray-900' }: MonthGridProps) {
  const som = startOfMonth(monthDate)
  const eom = endOfMonth(monthDate)
  const clampStart = maxDate([som, startDate])
  const clampEnd = minDate([eom, endDate])
  const weekStartOffset = mondayOffset(clampStart)
  const days = eachDayOfInterval({ start: clampStart, end: clampEnd })
  return (
    <div className={gridClassName ?? 'grid grid-cols-7 gap-1 w-[85mm] mx-auto mt-2 text-sm'}>
      {Array.from({ length: weekStartOffset }).map((_, i) => (
        <div key={`empty-${i}`} />
      ))}
      {days.map((day) => (
        <div key={day.toISOString()} className="min-h-10 p-1 border-2 border-gray-900 rounded-sm">
          <span className={dayTextClassName}>{format(day, 'dd/MM', { locale: pl })}</span>
          <div className="flex justify-end gap-0.5 mt-0.5">
            <div className={boxClassName} />
          </div>
        </div>
      ))}
    </div>
  )
}
