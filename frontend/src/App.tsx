import React, { useEffect, useState } from 'react'
import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import 'tui-image-editor/dist/tui-image-editor.css'
import '@toast-ui/editor/dist/toastui-editor.css'
import ImagePage from './pages/ImagePage'
import MarkdownPage from './pages/MarkdownPage'
import TemplatePrintPage from './pages/TemplatePrintPage'

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
  const [status, refreshStatus] = useStatus()
  const [loading, setLoading] = useState(false)

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
          </nav>
        </div>
      </header>

      <div className="mt-3">
        <Routes>
          <Route path="/" element={<Navigate to="/image" replace />} />
          <Route path="/image" element={<ImagePage refreshStatus={refreshStatus} />} />
          <Route path="/markdown" element={<MarkdownPage refreshStatus={refreshStatus} />} />
          <Route path="/template" element={<TemplatePrintPage refreshStatus={refreshStatus} />} />
        </Routes>
      </div>

      <footer className="mt-2 text-xs text-gray-600">
        Tips: Printer width is 384 px. The server resizes and converts to 1-bit automatically.
      </footer>
    </div>
  )
}
