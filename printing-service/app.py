import os
import errno
import logging
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

from printer import print_image_from_bytes, print_image_from_path, InvalidImageError

import socket

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("printing-service")

# Configuration via environment variables
PRINTER_MAC = os.getenv("PRINTER_MAC", "DC:0D:30:C1:01:35")
PRINTER_RFCOMM_CHANNEL = os.getenv("PRINTER_RFCOMM_CHANNEL") # Optional explicit rfcomm channel
CONNECT_RETRY_SEC = float(os.getenv("PRINTER_CONNECT_RETRY_SEC", "5"))
# Reject uploads larger than this so a huge/malicious file can't exhaust memory.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10 MiB


# Human-readable hints for the OS errors we typically see over Bluetooth RFCOMM.
_ERRNO_HINTS = {
    errno.EHOSTDOWN: "printer is powered off or out of range",
    errno.EHOSTUNREACH: "printer is unreachable (out of range or not paired)",
    errno.ECONNREFUSED: "printer refused the connection (wrong RFCOMM channel, or printer not ready)",
    errno.ETIMEDOUT: "connection timed out (printer asleep or out of range)",
    errno.EACCES: "permission denied (Bluetooth adapter busy or access not allowed)",
    errno.EPERM: "operation not permitted (Bluetooth may require elevated privileges)",
    errno.ENODEV: "no such device (Bluetooth adapter missing)",
    errno.EBADF: "Bluetooth socket is no longer valid",
    errno.EPIPE: "connection lost while sending (broken pipe)",
    errno.ECONNRESET: "connection reset by the printer",
}


def _describe_os_error(e: BaseException) -> str:
    """Turn a raw OSError/socket error into an actionable, readable string."""
    err = getattr(e, "errno", None)
    if err is not None:
        name = errno.errorcode.get(err, str(err))
        detail = getattr(e, "strerror", None) or str(e)
        hint = _ERRNO_HINTS.get(err)
        base = f"[{name}] {detail}"
        return f"{base} - {hint}" if hint else base
    return str(e) or repr(e)


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
    global _bt_sock, _bt_channel, _last_error, _last_connect_attempt
    with _state_lock:
        if _bt_sock is not None:
            return
        _last_connect_attempt = time.time()
        ch = _resolve_channel(PRINTER_MAC)
        try:
            sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        except OSError as e:
            _bt_sock = None
            _bt_channel = None
            _last_error = f"Bluetooth adapter unavailable: {_describe_os_error(e)}"
            logger.error(_last_error)
            return
        try:
            sock.connect((PRINTER_MAC, ch))
            sock.settimeout(None)
            _bt_sock = sock
            _bt_channel = ch
            _last_error = None
            logger.info("Connected to printer %s on RFCOMM channel %s", PRINTER_MAC, ch)
        except OSError as e:
            try:
                sock.close()
            except OSError:
                pass
            _bt_sock = None
            _bt_channel = None
            _last_error = (
                f"Bluetooth connect to {PRINTER_MAC} (channel {ch}) failed: "
                f"{_describe_os_error(e)}"
            )
            logger.error(_last_error)
        except Exception as e:
            try:
                sock.close()
            except OSError:
                pass
            _bt_sock = None
            _bt_channel = None
            _last_error = f"Unexpected error connecting to {PRINTER_MAC} (channel {ch}): {e!r}"
            logger.exception("Unexpected error connecting to printer")


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
            logger.info("Job %s printed successfully", job.id)
        except InvalidImageError as e:
            # Bad input, not a transport problem - keep the connection alive.
            with _jobs_lock:
                job.status = "error"
                job.error = f"Invalid image: {e}"
            logger.error("Job %s failed - invalid image: %s", job.id, e)
        except OSError as e:
            msg = _describe_os_error(e)
            with _jobs_lock:
                job.status = "error"
                job.error = f"Printer communication error: {msg}"
            logger.error("Job %s failed - transport error: %s", job.id, msg)
            # Drop connection to force reconnect next time
            _disconnect_bt()
        except Exception as e:
            with _jobs_lock:
                job.status = "error"
                job.error = f"Unexpected error: {e!r}"
            logger.exception("Job %s failed unexpectedly", job.id)
            # Drop connection to force reconnect next time
            _disconnect_bt()
        finally:
            # Clean up temp file
            try:
                os.unlink(job.path)
            except Exception:
                pass



async def _read_upload_limited(file: UploadFile) -> bytes:
    """Read an upload into memory, aborting early if it exceeds MAX_UPLOAD_BYTES.

    Reads in chunks so an oversized (or malicious) file is rejected before it is
    fully buffered, rather than after.
    """
    chunks = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            logger.warning(
                "Rejected upload exceeding limit (%d bytes > %d)", total, MAX_UPLOAD_BYTES
            )
            raise HTTPException(
                status_code=413,
                detail=(
                    f"File too large: exceeds the {MAX_UPLOAD_BYTES} byte "
                    f"({MAX_UPLOAD_BYTES // (1024 * 1024)} MiB) limit"
                ),
            )
        chunks.append(chunk)
    return b"".join(chunks)


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
    # Validate content
    content = await _read_upload_limited(file)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file: no image data was uploaded")

    # Ensure connected
    if not _is_connected():
        _connect_bt_if_needed()
    if not _is_connected():
        raise HTTPException(status_code=503, detail=_last_error or "Bluetooth not connected")

    assert _bt_sock is not None
    writer = SocketWriter(_bt_sock)
    try:
        # Stream image to the Bluetooth socket
        print_image_from_bytes(content, writer)
        return {"ok": True}
    except InvalidImageError as e:
        # Bad input - keep the connection, tell the caller what's wrong.
        logger.warning("Rejected print request - invalid image: %s", e)
        raise HTTPException(status_code=422, detail=f"Invalid image: {e}")
    except OSError as e:
        # Transport failure - drop the socket to force a reconnect next time.
        _disconnect_bt()
        msg = _describe_os_error(e)
        logger.error("Print failed - transport error: %s", msg)
        raise HTTPException(status_code=502, detail=f"Failed sending data to printer: {msg}")
    except Exception as e:
        _disconnect_bt()
        logger.exception("Print failed unexpectedly")
        raise HTTPException(status_code=500, detail=f"Print failed: {e!r}")


@app.post("/print-async")
async def print_async(file: UploadFile = File(...)):
    content = await _read_upload_limited(file)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file: no image data was uploaded")
    # Write to a temp file so worker can open it
    try:
        fd, path = tempfile.mkstemp(prefix="phomemo_", suffix=".img")
        with os.fdopen(fd, "wb") as f:
            f.write(content)
    except OSError as e:
        logger.error("Failed to store job file: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to store job file: {_describe_os_error(e)}")

    job_id = f"job_{int(time.time()*1000)}"
    job = PrintJob(id=job_id, path=path)
    with _jobs_lock:
        _jobs[job_id] = job
    _job_queue.put(job_id)
    logger.info("Queued print job %s", job_id)
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
