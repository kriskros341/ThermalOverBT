"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getPrintHistory,
  clearPrintHistory,
  onPrintHistoryChanged,
  type PrintHistoryItem,
} from '@/lib/printHistory';

export default function PrintHistory() {
  const router = useRouter();
  const [history, setHistory] = useState<PrintHistoryItem[]>([]);

  useEffect(() => {
    const refreshHistory = () => setHistory(getPrintHistory());
    refreshHistory();
    const unsubscribe = onPrintHistoryChanged(refreshHistory);
    return () => unsubscribe();
  }, []);

  const onRestore = (item: PrintHistoryItem) => {
    if (!item.route) return;
    // In Next.js, we can't pass state through navigation like in react-router.
    // A common pattern is to use query parameters to pass the restore data.
    // However, the payload can be large, so this is not ideal.
    // For now, we will just navigate to the route.
    // A more robust solution would involve a global state management library or a different architecture.
    router.push(item.route);
  };

  return (
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
                  onClick={() => onRestore(h)}
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
  );
}
