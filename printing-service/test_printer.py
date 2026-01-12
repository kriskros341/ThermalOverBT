import unittest
from unittest.mock import MagicMock, patch
from PIL import Image
from io import BytesIO
import os
# import asyncio # Not needed if no async tests

# Assuming printer.py is in the same directory
from printer import (
    print_header,
    print_marker,
    print_footer,
    _line_bytes,
    prepare_image,
    print_image_from_pil,
    print_image_from_path,
    print_image_from_bytes,
    PRINTER_WIDTH,
    MAX_MARKER_LINES,
)


class TestPrinterFunctions(unittest.TestCase):
    def setUp(self):
        # Create a dummy image for testing
        self.dummy_image = Image.new("RGB", (PRINTER_WIDTH * 2, 100), color="red")
        self.dummy_image_path = "test_image.png"
        self.dummy_image.save(self.dummy_image_path)
        self.mock_binary_io = MagicMock(spec=BytesIO) # Mock a BinaryIO object

    def tearDown(self):
        if os.path.exists(self.dummy_image_path):
            os.remove(self.dummy_image_path)

    def test_print_header(self):
        print_header(self.mock_binary_io)
        self.mock_binary_io.write.assert_called_once_with(b"\x1b\x40\x1b\x61\x01\x1f\x11\x02\x04")

    def test_print_marker(self):
        lines = 10
        print_marker(self.mock_binary_io, lines)
        expected_calls = [
            unittest.mock.call((0x761D).to_bytes(2, "little")),
            unittest.mock.call((0x0030).to_bytes(2, "little")),
            unittest.mock.call((0x0030).to_bytes(2, "little")),
            unittest.mock.call((lines - 1).to_bytes(2, "little")),
        ]
        self.mock_binary_io.write.assert_has_calls(expected_calls)

    def test_print_footer(self):
        print_footer(self.mock_binary_io)
        expected_calls = [
            unittest.mock.call(b"\x1b\x64\x02"),
            unittest.mock.call(b"\x1b\x64\x02"),
            unittest.mock.call(b"\x1f\x11\x08"),
            unittest.mock.call(b"\x1f\x11\x0e"),
            unittest.mock.call(b"\x1f\x11\x07"),
            unittest.mock.call(b"\x1f\x11\x09"),
        ]
        self.mock_binary_io.write.assert_has_calls(expected_calls)

    def test_line_bytes(self):
        # Create a 1-bit image with a known pattern
        img = Image.new("1", (8, 1), color=1)  # All white
        pixels = img.load()
        self.assertEqual(_line_bytes(pixels, 0, 8), b"\x00")

        img = Image.new("1", (8, 1), color=0)  # All black
        pixels = img.load()
        self.assertEqual(_line_bytes(pixels, 0, 8), b"\xff")

        # Specific pattern: Black, White, Black, White...
        img = Image.new("1", (8, 1))
        pixels = img.load()
        pixels[0, 0] = 0  # Black
        pixels[1, 0] = 1  # White
        pixels[2, 0] = 0  # Black
        pixels[3, 0] = 1  # White
        pixels[4, 0] = 0  # Black
        pixels[5, 0] = 1  # White
        pixels[6, 0] = 0  # Black
        pixels[7, 0] = 1  # White
        self.assertEqual(_line_bytes(pixels, 0, 8), b"\xaa")  # 10101010

        # Test with 0x0A (LineFeed) replacement
        img = Image.new("1", (8, 1))
        pixels = img.load()
        # This pattern (00001010) would result in 0x0A
        pixels[0, 0] = 1
        pixels[1, 0] = 1
        pixels[2, 0] = 1
        pixels[3, 0] = 1
        pixels[4, 0] = 0
        pixels[5, 0] = 1
        pixels[6, 0] = 0
        pixels[7, 0] = 1
        self.assertEqual(_line_bytes(pixels, 0, 8), b"\x14")  # Should be 0x14 instead of 0x0A

    def test_prepare_image(self):
        # Test resizing and conversion to 1-bit
        original_width = self.dummy_image.width
        original_height = self.dummy_image.height

        prepared_img = prepare_image(self.dummy_image, width=PRINTER_WIDTH)

        self.assertEqual(prepared_img.width, PRINTER_WIDTH)
        # Aspect ratio should be preserved
        expected_height = int(original_height * PRINTER_WIDTH / original_width)
        self.assertEqual(prepared_img.height, expected_height)
        self.assertEqual(prepared_img.mode, "1")

    @patch("printer.time.sleep")
    @patch("printer._write")
    @patch("printer.print_header")
    @patch("printer.print_marker")
    @patch("printer.print_footer")
    @patch("printer._line_bytes", MagicMock(return_value=b"\x00" * (PRINTER_WIDTH // 8)))
    def test_print_image_from_pil(
        self,
        mock_print_footer,
        mock_print_marker,
        mock_print_header,
        mock_write,
        mock_sleep,
    ):
        mock_on_progress = MagicMock()

        # Create a small image for testing to control loop iterations
        small_img = Image.new("1", (PRINTER_WIDTH, MAX_MARKER_LINES + 10), color=0)

        print_image_from_pil(small_img, self.mock_binary_io, on_progress=mock_on_progress)

        # Verify header and footer are called
        mock_print_header.assert_called_once_with(self.mock_binary_io)
        mock_print_footer.assert_called_once_with(self.mock_binary_io)

        # Verify print_marker is called for each chunk
        expected_marker_calls = (small_img.height + MAX_MARKER_LINES - 1) // MAX_MARKER_LINES
        self.assertEqual(mock_print_marker.call_count, expected_marker_calls)

        # Verify _write is called for image data
        self.assertTrue(mock_write.called)

        # Verify on_progress is called
        self.assertTrue(mock_on_progress.called)
        # Check the last call to on_progress
        mock_on_progress.assert_called_with(small_img.height, small_img.height)

        # Verify sleep is called
        self.assertTrue(mock_sleep.called)

    @patch("printer.Image.open")
    @patch("printer.print_image_from_pil")
    def test_print_image_from_path(self, mock_print_image_from_pil, mock_image_open):
        mock_on_progress = MagicMock()
        mock_image_instance = MagicMock()
        mock_image_open.return_value = mock_image_instance

        print_image_from_path(self.dummy_image_path, self.mock_binary_io, on_progress=mock_on_progress)

        mock_image_open.assert_called_once_with(self.dummy_image_path)
        mock_print_image_from_pil.assert_called_once_with(
            mock_image_instance, self.mock_binary_io, on_progress=mock_on_progress
        )

    @patch("printer.Image.open")
    @patch("printer.print_image_from_pil")
    @patch("io.BytesIO")
    def test_print_image_from_bytes(self, mock_bytesio, mock_print_image_from_pil, mock_image_open):
        mock_on_progress = MagicMock()
        dummy_bytes = b"dummy_image_bytes"
        mock_image_instance = MagicMock()
        mock_image_open.return_value = mock_image_instance
        mock_bytesio_instance = MagicMock()
        mock_bytesio.return_value = mock_bytesio_instance

        print_image_from_bytes(dummy_bytes, self.mock_binary_io, on_progress=mock_on_progress)

        mock_bytesio.assert_called_once_with(dummy_bytes)
        mock_image_open.assert_called_once_with(mock_bytesio_instance)
        mock_print_image_from_pil.assert_called_once_with(
            mock_image_instance, self.mock_binary_io, on_progress=mock_on_progress
        )


if __name__ == "__main__":
    unittest.main()