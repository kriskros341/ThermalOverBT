FastAPI server + React UI with Toast-ui editors
-------------------------

This repo includes a small FastAPI server that connects to the printer using a pure-Python Bluetooth RFCOMM socket (PyBluez) and exposes endpoints to print images.

Env vars:

- `PRINTER_MAC` (default: `DC:0D:30:C1:01:35`)
- `PRINTER_RFCOMM_CHANNEL` (optional) – RFCOMM channel/port. If not set, the server queries SDP; if that fails, it falls back to `1`.
- `PRINTER_CONNECT_RETRY_SEC` (default: `5`)

Install dependencies:

```
pip install -r requirements.txt
```

Check device MAC:

```
bluetoothctl paired-devices
```

Optionaly create explicit socket:
```
sudo rfcomm connect /dev/rfcomm0 DC:0D:30:C1:01:35
```

Run the server:

```
PRINTER_MAC=DC:0D:30:C1:01:35 uvicorn app:app --host 0.0.0.0 --port 8000
```

Build the React UI (optional; pre-existing simple UI will be replaced when you build):

```
cd frontend
npm install
npm run build
```

This builds into `web/`, which FastAPI serves at `/ui/`.

Endpoints:

- `GET /status` – connection info (connected/channel/last error)
- `POST /connect` – try to connect now
- `POST /disconnect` – close current socket
- `POST /print` – multipart form-data with a `file` field containing the image to print

License
-------------------------

You can use, modify, and share this software freely.
If you distribute it (or your modifications), you must include the source, keep it under GPLv3, and preserve copyright notices.