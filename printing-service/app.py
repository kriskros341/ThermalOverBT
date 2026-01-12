import os
import threading
import time
import tempfile
import queue
from dataclasses import dataclass, asdict
from typing import Optional, Any, Dict

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from printer import print_image_from_bytes, print_image_from_path

import socket

# Configuration via environment variables
PRINTER_MAC = os.getenv("PRINTER_MAC", "DC:0D:30:C1:01:35")
PRINTER_RFCOMM_CHANNEL = os.getenv("PRINTER_RFCOMM_CHANNEL") # Optional explicit rfcomm channel
CONNECT_RETRY_SEC = float(os.getenv("PRINTER_CONNECT_RETRY_SEC", "5"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    t = threading.Thread(target=_connector_loop, name="rfcomm-connector", daemon=True)
    t.start()
    w = threading.Thread(target=_print_worker_loop, name="print-worker", daemon=True)
    w.start()

    yield

    _stop_event.set()
    _worker_stop_event.set()
    _disconnect_bt()

app = FastAPI(title="Phomemo Printer API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Client side web UI mounted at /ui if folder exists
if os.path.isdir("web"):
    app.mount("/ui", StaticFiles(directory="web", html=True), name="ui")

# Internal state
_bt_sock: Optional[Any] = None
_bt_channel: Optional[int] = None
_last_error: Optional[str] = None
_last_connect_attempt: Optional[float] = None
_state_lock = threading.Lock()
_stop_event = threading.Event()
_worker_stop_event = threading.Event()


@dataclass
class PrintJob:
    id: str
    path: str
    status: str = "queued"  # queued | printing | done | error
    total: int = 0
    done: int = 0
    error: Optional[str] = None
    created_at: float = time.time()


_jobs: Dict[str, PrintJob] = {}
_jobs_lock = threading.Lock()
_job_queue: "queue.Queue[str]" = queue.Queue()


class SocketWriter:
    def __init__(self, sock: Any) -> None:
        self.sock = sock

    def write(self, b: bytes) -> int:
        if not isinstance(b, (bytes, bytearray)):
            raise TypeError("write() argument must be bytes-like")
        self.sock.sendall(b)
        return len(b)

    def flush(self) -> None:  # for file-like compatibility
        return None


def _resolve_channel(mac: str) -> int:
    # 1) env override
    if PRINTER_RFCOMM_CHANNEL:
        try:
            return int(PRINTER_RFCOMM_CHANNEL)
        except ValueError:
            pass
    # 2) Typical default channel for SPP
    return 1


def _is_connected() -> bool:
    return _bt_sock is not None


def _connect_bt_if_needed() -> None:
    global _bt_sock, _bt_channel, _last_error
    with _state_lock:
        if _bt_sock is not None:
            return
        _last_connect_attempt = time.time()
        try:
            ch = _resolve_channel(PRINTER_MAC)
            sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
            sock.connect((PRINTER_MAC, ch))
            sock.settimeout(None)
            _bt_sock = sock
            _bt_channel = ch
            _last_error = None
        except Exception as e:
            _bt_sock = None
            _bt_channel = None
            _last_error = f"Bluetooth connect failed: {e}"


def _disconnect_bt() -> None:
    global _bt_sock, _bt_channel, _last_error
    with _state_lock:
        if _bt_sock is not None:
            try:
                _bt_sock.close()
            except Exception:
                pass
        _bt_sock = None
        _bt_channel = None
        _last_error = None


def _connector_loop():
    # Background loop that ensures Bluetooth socket stays connected
    while not _stop_event.is_set():
        try:
            if not _is_connected():
                _connect_bt_if_needed()
        except Exception as e:
            with _state_lock:
                global _last_error
                _last_error = f"Connector loop error: {e}"
        _stop_event.wait(CONNECT_RETRY_SEC)


def _print_worker_loop():
    # Background worker that processes queued print jobs # AI generated
    while not _worker_stop_event.is_set():
        try:
            job_id = _job_queue.get(timeout=0.2)
        except queue.Empty:
            continue
        with _jobs_lock:
            job = _jobs.get(job_id)
        if not job:
            continue
        # Ensure BT connection
        if not _is_connected():
            _connect_bt_if_needed()
        if not _is_connected():
            with _jobs_lock:
                job.status = "error"
                job.error = _last_error or "Bluetooth not connected"
            continue
        try:
            writer = SocketWriter(_bt_sock)  # type: ignore
            def on_prog(done: int, total: int):
                with _jobs_lock:
                    job.done = done
                    job.total = total
                    job.status = "printing"
            print_image_from_path(job.path, writer, on_progress=on_prog)
            with _jobs_lock:
                job.status = "done"
        except Exception as e:
            with _jobs_lock:
                job.status = "error"
                job.error = str(e)
            # Drop connection to force reconnect next time
            _disconnect_bt()
        finally:
            # Clean up temp file
            try:
                os.unlink(job.path)
            except Exception:
                pass



@app.get("/")
async def root():
    # Redirect to the web UI if mounted, otherwise suggest API endpoints
    if os.path.isdir("web"):
        return RedirectResponse(url="/ui/")
    return JSONResponse({"message": "Web UI not bundled. Use /status, /connect, /print endpoints or add a 'web' folder."})

@app.get("/status")
async def status():
    with _state_lock:
        running = _is_connected()
        return JSONResponse(
            {
                "mac": PRINTER_MAC,
                "channel": _bt_channel,
                "connected": running,
                "last_connect_attempt": _last_connect_attempt,
                "last_error": _last_error,
                "transport": "bluetooth-rfcomm-socket",
            }
        )


@app.post("/connect")
async def connect():
    _connect_bt_if_needed()
    if not _is_connected():
        raise HTTPException(status_code=500, detail=_last_error or "not connected")
    return {"ok": True}


@app.post("/disconnect")
async def disconnect():
    _disconnect_bt()
    return {"ok": True}


@app.post("/print")
async def print_image(file: UploadFile = File(...)):
    # Valdidate content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    # Ensure connected
    if not _is_connected():
        _connect_bt_if_needed()
    if not _is_connected():
        raise HTTPException(status_code=503, detail=_last_error or "Bluetooth not connected")

    try:
        # Stream image to the Bluetooth socket
        assert _bt_sock is not None
        writer = SocketWriter(_bt_sock)
        print_image_from_bytes(content, writer)
        return {"ok": True}
    except Exception as e:
        # On failure, drop the socket to force a reconnect next time
        _disconnect_bt()
        raise HTTPException(status_code=500, detail=f"Print failed: {e}")


@app.post("/print-async")
async def print_async(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    # Write to a temp file so worker can open it
    try:
        fd, path = tempfile.mkstemp(prefix="phomemo_", suffix=".img")
        with os.fdopen(fd, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store job file: {e}")

    job_id = f"job_{int(time.time()*1000)}"
    job = PrintJob(id=job_id, path=path)
    with _jobs_lock:
        _jobs[job_id] = job
    _job_queue.put(job_id)
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        data = asdict(job)
    total = data.get("total") or 0
    done = data.get("done") or 0
    data["percent"] = (done / total * 100.0) if total > 0 else 0.0
    return JSONResponse(data)


@app.get("/jobs")
async def jobs_list():
    with _jobs_lock:
        items = [asdict(j) for j in _jobs.values()]
    items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    for d in items:
        t = d.get("total") or 0
        dn = d.get("done") or 0
        d["percent"] = (dn / t * 100.0) if t > 0 else 0.0
    return JSONResponse({"jobs": items})
