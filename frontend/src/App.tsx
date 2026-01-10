import React, { useEffect, useState } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import 'tui-image-editor/dist/tui-image-editor.css'
import '@toast-ui/editor/dist/toastui-editor.css'
import ImagePage from './pages/ImagePage'
import MarkdownPage from './pages/MarkdownPage'
import TemplatePrintPage from './pages/TemplatePrintPage'
import CalendarPage from './pages/CalendarPage'
import QRCodePage from './pages/QRCodePage'
import { clearPrintHistory, getPrintHistory, onPrintHistoryChanged, type PrintHistoryItem } from './utils/printHistory'

type Status = {
  loading: boolean
  connected?: boolean
  channel?: number
  last_error?: string
  error?: string
}

function useStatus(): [Status, () => Promise<void>] {
  const [status, setStatus] = useState<Status>({ loading: true })
  const refresh = async () => {
    try {
      const res = await fetch('/status')
      const data = await res.json()
      setStatus({ loading: false, ...(data as any) })
    } catch (e: any) {
      setStatus({ loading: false, error: e?.message ?? String(e) })
    }
  }
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [])
  return [status, refresh]
}

export default function App() {
  const navigate = useNavigate()
  const [status, refreshStatus] = useStatus()
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<PrintHistoryItem[]>(() => getPrintHistory())

  useEffect(() => {
    const refreshHistory = () => setHistory(getPrintHistory())
    refreshHistory()
    return onPrintHistoryChanged(refreshHistory)
  }, [])

  const onConnect = async () => {
    setLoading(true)
    try {
      const res = await fetch('/connect', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
    } catch (e: any) {
      alert('Connect failed: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
      refreshStatus()
    }
  }

  const onDisconnect = async () => {
    setLoading(true)
    try {
      const res = await fetch('/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
    } catch (e: any) {
      alert('Disconnect failed: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
      refreshStatus()
    }
  }

  const pillBase = 'px-2 py-1 rounded-md'
  const statusClass = status.loading
    ? `${pillBase} bg-gray-100 text-gray-700`
    : status.connected
    ? `${pillBase} bg-green-100 text-green-800`
    : `${pillBase} bg-amber-100 text-amber-800`

  const btnCls = 'px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed'

  return (
    <div className="p-3">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-xl font-semibold">Phomemo Printer</h2>
        <div className={statusClass}>
          {status.loading
            ? 'Loading…'
            : status.connected
            ? `Connected (channel ${status.channel ?? '?'})`
            : `Disconnected${status.last_error ? ` – ${status.last_error}` : ''}`}
        </div>
        <div className="flex gap-2">
          <button className={btnCls} onClick={onConnect} disabled={loading}>Connect</button>
          <button className={btnCls} onClick={onDisconnect} disabled={loading}>Disconnect</button>
          <nav className="flex gap-1 border border-gray-300 rounded-md p-1">
            <NavLink to="/image" className={({isActive}) => `px-2.5 py-1.5 rounded no-underline text-gray-800 ${isActive ? 'bg-gray-100' : ''}`}>Image</NavLink>
            <NavLink to="/markdown" className={({isActive}) => `px-2.5 py-1.5 rounded no-underline text-gray-800 ${isActive ? 'bg-gray-100' : ''}`}>Markdown</NavLink>
            <NavLink to="/template" className={({isActive}) => `px-2.5 py-1.5 rounded no-underline text-gray-800 ${isActive ? 'bg-gray-100' : ''}`}>Template</NavLink>
            <NavLink to="/calendar" className={({isActive}) => `px-2.5 py-1.5 rounded no-underline text-gray-800 ${isActive ? 'bg-gray-100' : ''}`}>Calendar</NavLink>
            <NavLink to="/qr-code" className={({isActive}) => `px-2.5 py-1.5 rounded no-underline text-gray-800 ${isActive ? 'bg-gray-100' : ''}`}>QR Code</NavLink>
          </nav>
        </div>
      </header>

      <div className="mt-3">
        <Routes>
          <Route path="/" element={<Navigate to="/image" replace />} />
          <Route path="/image" element={<ImagePage refreshStatus={refreshStatus} />} />
          <Route path="/markdown" element={<MarkdownPage refreshStatus={refreshStatus} />} />
          <Route path="/template" element={<TemplatePrintPage refreshStatus={refreshStatus} />} />
          <Route path="/calendar" element={<CalendarPage refreshStatus={refreshStatus} />} />
          <Route path="/qr-code" element={<QRCodePage refreshStatus={refreshStatus} />} />
        </Routes>
      </div>

      <footer className="mt-2 text-xs text-gray-600">
        <div>Tips: Printer width is 384 px. The server resizes and converts to 1-bit automatically.</div>

        <div className="mt-2 border-t border-gray-200 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-700">Print history</div>
            <button
              className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
              onClick={() => clearPrintHistory()}
              disabled={history.length === 0}
              type="button"
            >
              Clear
            </button>
          </div>

          {history.length === 0 ? (
            <div className="mt-1 text-xs text-gray-500">No prints yet.</div>
          ) : (
            <div className="mt-1 grid gap-1">
              {history.slice(0, 10).map((h) => (
                <div key={h.job_id} className="flex items-center justify-between gap-2">
                  <div className="text-gray-700 truncate">
                    {h.summary || (h.kind ? `[${h.kind}]` : '') || h.filename || h.job_id}
                  </div>
                  <div className="text-gray-500 whitespace-nowrap">
                    <button
                      className="mr-2 px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
                      type="button"
                      disabled={!h.route}
                      onClick={() => {
                        if (!h.route) return
                        navigate(h.route, { state: { restore: h } })
                      }}
                      title={h.route ? `Restore into ${h.route}` : 'No route stored for this history item'}
                    >
                      Restore
                    </button>
                    {new Date(h.created_at).toLocaleString()} • {h.job_id}
                  </div>
                </div>
              ))}
              {history.length > 10 && (
                <div className="text-gray-500">…and {history.length - 10} more</div>
              )}
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
