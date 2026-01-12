"use client";

import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import dynamic from 'next/dynamic';
import '@toast-ui/editor/dist/toastui-editor.css';
import { 
  captureElementToCanvas, 
  canvasToPngBlob, 
  mountCanvasIn, 
  postImageToPrinter,
  PRINTER_WIDTH_PX
} from '@/lib/print-helpers';
import { summarizeText, limitPayloadString } from '@/lib/printHistory';
import { TuiEditorRef } from '@/components/TuiEditor';

const MdEditor = dynamic(() => import('@/components/TuiEditor'), { ssr: false });


export default function MarkdownPage() {
  const [markdown, setMarkdown] = useState<string>('');
  const previewRef = useRef<HTMLDivElement | null>(null);
  const mdRef = useRef<TuiEditorRef>(null);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);

  const onPrint = async () => {
    if (!previewRef.current) return;
    try {
      setLoading(true);
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
      
      const trimmed = markdown.trim();
      const { job_id } = await postImageToPrinter(blob, 'markdown.png', {
        route: '/markdown',
        kind: 'markdown',
        summary: summarizeText(trimmed),
        payload: { markdown: limitPayloadString(trimmed) },
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
    return () => { stop = true };
  }, [jobId]);

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
            ref={mdRef}
            initialValue={markdown}
            initialEditType="markdown"
            previewStyle="tab"
            height="720px"
            usageStatistics={false}
            placeholder="Write notes here…"
            onChange={() => {
              try {
                const inst = mdRef.current?.getInstance?.();
                const md = inst?.getMarkdown?.() ?? ''
                setMarkdown(md);
              } catch {
                // ignore
              }
            }}
          />
        </div>

        <div className="prose w-1/2 h-[720px] outline outline-[#dadde6] rounded-md p-2">
          <div ref={previewRef} className="">
            <ReactMarkdown
              rehypePlugins={[rehypeRaw]}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
