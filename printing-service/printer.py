from typing import Callable, Optional
from PIL import Image
import time
import asyncio
from bleak import BleakClient, BleakError

# Printer constants
PRINTER_WIDTH = 384  # dots
MAX_MARKER_LINES = 256  # Height of a chunk between markers

# Bleak specific constants (PLACEHOLDERS - REPLACE WITH ACTUAL PRINTER UUIDS)
# You will need to discover these UUIDs for your specific Phomemo printer.
# Use tools like nRF Connect (mobile app) or bleak's own discovery functions.
PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb"  # Example Service UUID
PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb"  # Example Characteristic UUID
WRITE_CHUNK_SIZE = 20  # Typical BLE MTU size, adjust if needed

class PrinterConnectionError(Exception):
    """Custom exception for printer connection issues."""
    pass

async def _write_ble(client: BleakClient, characteristic_uuid: str, data: bytes) -> None:
    """
    Writes data to the specified BLE characteristic, handling chunking.
    """
    if not client.is_connected:
        raise PrinterConnectionError("BLE client is not connected.")

    for i in range(0, len(data), WRITE_CHUNK_SIZE):
        chunk = data[i : i + WRITE_CHUNK_SIZE]
        try:
            await client.write_gatt_char(characteristic_uuid, chunk, response=True)
        except BleakError as e:
            raise PrinterConnectionError(f"Failed to write to characteristic: {e}") from e
        except Exception as e:
            raise PrinterConnectionError(f"An unexpected error occurred during BLE write: {e}") from e


async def print_header(client: BleakClient, characteristic_uuid: str) -> None:
    await _write_ble(client, characteristic_uuid, b"\x1b\x40\x1b\x61\x01\x1f\x11\x02\x04")


async def print_marker(client: BleakClient, characteristic_uuid: str, lines: int = 0x100) -> None:
    await _write_ble(client, characteristic_uuid, (0x761D).to_bytes(2, "little"))
    await _write_ble(client, characteristic_uuid, (0x0030).to_bytes(2, "little"))
    await _write_ble(client, characteristic_uuid, (0x0030).to_bytes(2, "little"))
    await _write_ble(client, characteristic_uuid, (lines - 1).to_bytes(2, "little"))


async def print_footer(client: BleakClient, characteristic_uuid: str) -> None:
    await _write_ble(client, characteristic_uuid, b"\x1b\x64\x02")
    await _write_ble(client, characteristic_uuid, b"\x1b\x64\x02")
    await _write_ble(client, characteristic_uuid, b"\x1f\x11\x08")
    await _write_ble(client, characteristic_uuid, b"\x1f\x11\x0e")
    await _write_ble(client, characteristic_uuid, b"\x1f\x11\x07")
    await _write_ble(client, characteristic_uuid, b"\x1f\x11\x09")


def _line_bytes(pixels, y: int, width: int) -> bytes:
    # Build one line of packed 1bpp data (MSB first)
    width_bytes = width // 8
    row = bytearray(width_bytes)
    idx = 0
    for x in range(width_bytes):
        byte = 0
        base = x * 8
        # Unroll for speed
        if pixels[base + 0, y] == 0:
            byte |= 1 << 7
        if pixels[base + 1, y] == 0:
            byte |= 1 << 6
        if pixels[base + 2, y] == 0:
            byte |= 1 << 5
        if pixels[base + 3, y] == 0:
            byte |= 1 << 4
        if pixels[base + 4, y] == 0:
            byte |= 1 << 3
        if pixels[base + 5, y] == 0:
            byte |= 1 << 2
        if pixels[base + 6, y] == 0:
            byte |= 1 << 1
        if pixels[base + 7, y] == 0:
            byte |= 1 << 0
        # 0x0a breaks the rendering (LineFeed), replace with 0x14
        if byte == 0x0A:
            byte = 0x14
        row[idx] = byte
        idx += 1
    return bytes(row)


def prepare_image(img: Image.Image, width: int = PRINTER_WIDTH) -> Image.Image:
    # Resize preserving aspect ratio to printer width, convert to 1-bit
    h = int(img.height * width / img.width)
    img = img.resize(size=(width, h))
    img = img.convert(mode="1")
    return img


async def print_image_from_pil(
    img: Image.Image,
    client: BleakClient,
    characteristic_uuid: str,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    image = prepare_image(img)

    width = image.width
    height = image.height
    pixels = image.load()  # faster pixel access

    remaining = height
    line = 0
    done = 0
    await print_header(client, characteristic_uuid)
    while remaining > 0:
        lines = remaining if remaining <= MAX_MARKER_LINES else MAX_MARKER_LINES
        await print_marker(client, characteristic_uuid, lines)
        # Build a whole block (lines * width_bytes) and write once
        block = bytearray((width // 8) * lines)
        offset = 0
        for i in range(lines):
            row = _line_bytes(pixels, line + i, width)
            end = offset + len(row)
            block[offset:end] = row
            offset = end
        await _write_ble(client, characteristic_uuid, bytes(block))
        # Without this delay the printer may drop data
        # - This delay may need to be adjusted based on printer model/speed
        # - Mine is M02, 4 seconds works reliably
        time.sleep(4) # Bleak operations are async, but time.sleep is blocking. Consider asyncio.sleep if this is an issue.
        
        remaining -= lines
        line += lines
        done += lines
        if on_progress is not None:
            try:
                on_progress(done, height)
            except Exception:
                # Ignore progress callback failures
                pass
    await print_footer(client, characteristic_uuid)


async def print_image_from_path(
    path: str,
    client: BleakClient,
    characteristic_uuid: str,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    img = Image.open(path)
    await print_image_from_pil(img, client, characteristic_uuid, on_progress=on_progress)


async def print_image_from_bytes(
    data: bytes,
    client: BleakClient,
    characteristic_uuid: str,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    from io import BytesIO

    img = Image.open(BytesIO(data))
    await print_image_from_pil(img, client, characteristic_uuid, on_progress=on_progress)

async def find_and_print(
    address: str,
    image_path: str,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    """
    Connects to a BLE printer, prints an image from a path, and disconnects.
    """
    try:
        async with BleakClient(address) as client:
            if not client.is_connected:
                raise PrinterConnectionError(f"Failed to connect to {address}")
            
            # Ensure the service and characteristic exist
            # This part might need more robust discovery based on the printer's actual GATT profile
            services = await client.get_services()
            service_found = False
            char_found = False
            for service in services:
                if service.uuid == PRINTER_SERVICE_UUID:
                    service_found = True
                    for char in service.characteristics:
                        if char.uuid == PRINTER_CHARACTERISTIC_UUID:
                            char_found = True
                            break
                    break
            
            if not service_found:
                raise PrinterConnectionError(f"Printer service {PRINTER_SERVICE_UUID} not found.")
            if not char_found:
                raise PrinterConnectionError(f"Printer characteristic {PRINTER_CHARACTERISTIC_UUID} not found.")

            await print_image_from_path(image_path, client, PRINTER_CHARACTERISTIC_UUID, on_progress)
            print(f"Successfully printed {image_path} to {address}")

    except BleakError as e:
        raise PrinterConnectionError(f"BLE error: {e}") from e
    except PrinterConnectionError:
        raise # Re-raise custom errors
    except Exception as e:
        raise PrinterConnectionError(f"An unexpected error occurred: {e}") from e