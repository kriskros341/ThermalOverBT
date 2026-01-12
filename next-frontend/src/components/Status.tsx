"use client";

import { useState, useEffect } from 'react';

type Status = {
  loading: boolean;
  connected?: boolean;
  channel?: number;
  last_error?: string;
  error?: string;
};

function useStatus(): [Status, () => Promise<void>] {
  const [status, setStatus] = useState<Status>({ loading: true });
  const refresh = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus({ loading: false, ...(data as any) });
    } catch (e: any) {
      setStatus({ loading: false, error: e?.message ?? String(e) });
    }
  };
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);
  return [status, refresh];
}

export default function Status() {
  const [status, refreshStatus] = useStatus();
  const [loading, setLoading] = useState(false);

  const onConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/connect', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
    } catch (e: any) {
      alert('Connect failed: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
      refreshStatus();
    }
  };

  const onDisconnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
    } catch (e: any) {
      alert('Disconnect failed: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
      refreshStatus();
    }
  };

  const pillBase = 'px-2 py-1 rounded-md';
  const statusClass = status.loading
    ? `${pillBase} bg-gray-100 text-gray-700`
    : status.connected
    ? `${pillBase} bg-green-100 text-green-800`
    : `${pillBase} bg-amber-100 text-amber-800`;

  const btnCls = 'px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <>
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
      </div>
    </>
  );
}
