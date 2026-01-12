"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  PRINTER_WIDTH_PX,
  captureElementToCanvas,
  canvasToPngBlob,
  mountCanvasIn,
  postImageToPrinter,
} from '@/lib/print-helpers';
import { summarizeText, limitPayloadString } from '@/lib/printHistory';

export default function QRCodePage() {
  const [text, setText] = useState<string>('https://example.com');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);

  const trimmed = useMemo(() => text.trim(), [text]);

  useEffect(() => {
    if (!trimmed) {
      setQrDataUrl('');
      setQrError(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        setQrLoading(true);
        setQrError(null);

        const dataUrl = await QRCode.toDataURL(trimmed, {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: 320,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        if (alive) setQrDataUrl(dataUrl);
      } catch (e: any) {
        if (!alive) return;
        setQrError(e?.message ?? String(e));
        setQrDataUrl('');
      } finally {
        if (alive) setQrLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [trimmed]);

  const ensureImgLoaded = async (root: HTMLElement) => {
    const img = root.querySelector('img') as HTMLImageElement | null;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) return;
    await new Promise<void>((resolve) => {
      const onDone = () => {
        img.removeEventListener('load', onDone);
        img.removeEventListener('error', onDone);
        resolve();
      };
      img.addEventListener('load', onDone);
      img.addEventListener('error', onDone);
    });
  };

  const onPrint = async () => {
    if (!previewRef.current) return;
    try {
      setLoading(true);
      await ensureImgLoaded(previewRef.current);
      const canvas = await captureElementToCanvas(previewRef.current, PRINTER_WIDTH_PX, 2);
      setPreviewCanvas(canvas);
      setShowPreview(true);
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  const sendToPrinter = async () => {
    try {
      if (!previewCanvas) return;
      setLoading(true);
      const blob = await canvasToPngBlob(previewCanvas);
      
      const { job_id } = await postImageToPrinter(blob, 'qr.png', {
        route: '/qr-code',
        kind: 'qr',
        summary: summarizeText(trimmed),
        payload: { text: limitPayloadString(trimmed) },
      });

      setJobId(job_id);
      setJobStatus('queued');
      setShowPreview(false);
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showPreview) return;
    const mount = canvasMountRef.current;
    if (!mount) return;
    if (previewCanvas) {
      mountCanvasIn(mount, previewCanvas, PRINTER_WIDTH_PX);
    }
  }, [previewCanvas, showPreview]);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`);
        if (!r.ok) return;
        const j = await r.json();
        setPercent((j as any).percent || 0);
        setJobStatus((j as any).status);
        if ((j as any).status === 'done' || (j as any).status === 'error') return;
      } catch {}
      if (!stop) setTimeout(tick, 800);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  const btnCls =
    'px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="w-[980px] mx-auto">
      <div className="flex items-center gap-2 my-2">
        <button
          className={btnCls}
          onClick={onPrint}
          disabled={loading || qrLoading || !trimmed || !qrDataUrl}
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
        <div>
          <div className="mb-2 text-sm font-medium">Text / URL</div>
          <textarea
            className="w-full h-[240px] outline outline-[#dadde6] rounded-md p-2 font-mono text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to encode…"
            spellCheck={false}
          />
          <div className="mt-2 text-xs text-gray-600">QR generation uses the qrcode library.</div>
          {qrError && <div className="mt-1 text-xs text-red-700">{qrError}</div>}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Preview</div>
          <div className="outline outline-[#dadde6] rounded-md p-3 bg-white">
            <div
              ref={previewRef}
              className="not-prose w-[384px] mx-auto flex flex-col items-center gap-2"
              style={{ background: '#fff' }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="block m-0"
                  style={{ width: 320, height: 320, imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="w-[320px] h-[320px] flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-300">
                  {qrLoading ? 'Generating…' : 'No QR code'}
                </div>
              )}

              {trimmed && (
                <div className="text-[16px] text-gray-800 break-words w-[320px] text-center">
                  {trimmed}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}