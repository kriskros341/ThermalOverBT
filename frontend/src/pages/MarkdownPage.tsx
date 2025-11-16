import React, { useRef, useState, useEffect } from 'react'
import html2canvas from 'html2canvas'
import ReactMarkdown from 'react-markdown'
// import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Editor as MdEditor } from '@toast-ui/react-editor'

type Props = { refreshStatus?: () => Promise<void> }

export default function MarkdownPage({ refreshStatus }: Props) {
  const [markdown, setMarkdown] = useState<string>('')
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
    if (!previewRef.current) return;
    try {
      setLoading(true);

      // 1. Clone the node deeply instead of using innerHTML. 
      // This preserves all Tailwind classes and inline styles exactly.
      const clone = previewRef.current.cloneNode(true) as HTMLElement;

      // 2. Create a wrapper to handle the offscreen rendering
      const container = document.createElement('div');
      
      // 3. Apply positioning and dimensions to the wrapper
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '384px'; // Fixed print width
      
      // CRITICAL: Do NOT manually set fontFamily or lineHeight here. 
      // Let the Tailwind classes in the 'clone' handle typography.
      
      container.appendChild(clone);
      document.body.appendChild(container);

      // -----------------------------------------------------------------
      // ✨ KEY FIX: Wait for the browser to render the new node
      // This gives it time to apply all the Tailwind CSS rules
      // from your stylesheet to the newly added 'clone'.
      // -----------------------------------------------------------------
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // 4. Generate Canvas
      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2, // High resolution
        logging: false,
        // Fixes issue where text shifts if user has scrolled down the page
        scrollY: -window.scrollY, 
        useCORS: true, // Ensures external fonts load correctly
      });

      // 5. Cleanup and open preview (don't send yet)
      document.body.removeChild(container);
      setPreviewCanvas(canvas);
      setShowPreview(true);
      
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
      // Only refresh after actually sending to printer
    }
  };

  const sendToPrinter = async () => {
    try {
      if (!previewCanvas) return;
      setLoading(true);
      const dataURL = previewCanvas.toDataURL('image/png');
      const blob = await (await fetch(dataURL)).blob();
      const fd = new FormData();
      fd.append('file', blob, 'note.png');

      const res = await fetch('/print-async', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const data = await res.json();
      setJobId((data as any).job_id as string);
      setJobStatus('queued');
      setShowPreview(false);
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
      refreshStatus?.();
    }
  };
  // Mount the returned canvas element into the preview modal container
  useEffect(() => {
    if (!showPreview) return
    const mount = canvasMountRef.current
    if (!mount) return
    // Clear previous children
    mount.innerHTML = ''
    if (previewCanvas) {
      // Ensure a consistent CSS width for display; pixels will be scaled by device pixel ratio
      previewCanvas.style.width = '384px'
      previewCanvas.style.height = 'auto'
      mount.appendChild(previewCanvas)
    }
    // No explicit cleanup to preserve canvas element between open/close cycles
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
    // Prevent multiple insertions
    if (document.getElementById('tailwind-cdn')) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'tailwind-cdn';
    script.src = 'https://cdn.tailwindcss.com';
    script.defer = true;

    document.head.appendChild(script);

    return () => {
      // Don’t remove script — keep globally cached
    };
  }, []);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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

        <div className="w-1/2 h-[720px] outline outline-[#dadde6] rounded-md p-2">
          <div ref={previewRef} className="">
            <ReactMarkdown
              // remarkPlugins={[remarkGfm]}
              // rehypePlugins={[rehypeRaw, rehypeSanitize]}
              rehypePlugins={[rehypeRaw]}
              components={{
                text: ({ node, ...props }) => <text {...props} />,
              }}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
