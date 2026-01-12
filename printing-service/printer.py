from typing import BinaryIO, Callable, Optional
from PIL import Image
import time

# Printer constants
PRINTER_WIDTH = 384  # dots
MAX_MARKER_LINES = 256 # Height of a chunk between markers

# Printer interface implementation is AI generated
def _write(out: BinaryIO, data: bytes) -> None:
    out.write(data)


def print_header(out: BinaryIO) -> None:
    _write(out, b"\x1b\x40\x1b\x61\x01\x1f\x11\x02\x04")


def print_marker(out: BinaryIO, lines: int = 0x100) -> None:
    _write(out, (0x761D).to_bytes(2, "little"))
    _write(out, (0x0030).to_bytes(2, "little"))
    _write(out, (0x0030).to_bytes(2, "little"))
    _write(out, (lines - 1).to_bytes(2, "little"))


def print_footer(out: BinaryIO) -> None:
    _write(out, b"\x1b\x64\x02")
    _write(out, b"\x1b\x64\x02")
    _write(out, b"\x1f\x11\x08")
    _write(out, b"\x1f\x11\x0e")
    _write(out, b"\x1f\x11\x07")
    _write(out, b"\x1f\x11\x09")


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


def print_image_from_pil(
    img: Image.Image,
    out: BinaryIO,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    image = prepare_image(img)

    width = image.width
    height = image.height
    pixels = image.load()  # faster pixel access

    remaining = height
    line = 0
    done = 0
    print_header(out)
    while remaining > 0:
        lines = remaining if remaining <= MAX_MARKER_LINES else MAX_MARKER_LINES
        print_marker(out, lines)
        # Build a whole block (lines * width_bytes) and write once
        block = bytearray((width // 8) * lines)
        offset = 0
        for i in range(lines):
            row = _line_bytes(pixels, line + i, width)
            end = offset + len(row)
            block[offset:end] = row
            offset = end
        _write(out, bytes(block))
        # Without this delay the printer may drop data
        # - This delay may need to be adjusted based on printer model/speed
        # - Mine is M02, 4 seconds works reliably
        time.sleep(4)
        # Probably no need to flush on each write
        try:
            out.flush()
        except Exception:
            # Not all file-like objects require flush
            pass
        remaining -= lines
        line += lines
        done += lines
        if on_progress is not None:
            try:
                on_progress(done, height)
            except Exception:
                # Ignore progress callback failures
                pass
    print_footer(out)
    try:
        out.flush()
    except Exception:
        # Not all file-like objects require flush
        pass


def print_image_from_path(
    path: str,
    out: BinaryIO,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    img = Image.open(path)
    return print_image_from_pil(img, out, on_progress=on_progress)


def print_image_from_bytes(
    data: bytes,
    out: BinaryIO,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> None:
    from io import BytesIO

    img = Image.open(BytesIO(data))
    return print_image_from_pil(img, out, on_progress=on_progress)
