import unittest
from unittest.mock import MagicMock, AsyncMock, patch
from PIL import Image
from io import BytesIO
import os
import asyncio

# Assuming printer.py is in the same directory
from printer import (
    _write_ble,
    print_header,
    print_marker,
    print_footer,
    _line_bytes,
    prepare_image,
    print_image_from_pil,
    print_image_from_path,
    print_image_from_bytes,
    find_and_print,
    PRINTER_WIDTH,
    MAX_MARKER_LINES,
    PRINTER_SERVICE_UUID,
    PRINTER_CHARACTERISTIC_UUID,
    PrinterConnectionError,
)


class TestPrinterFunctions(unittest.TestCase):
    def setUp(self):
        # Create a dummy image for testing
        self.dummy_image = Image.new("RGB", (PRINTER_WIDTH * 2, 100), color="red")
        self.dummy_image_path = "test_image.png"
        self.dummy_image.save(self.dummy_image_path)
        self.mock_client = AsyncMock()
        self.mock_client.is_connected = True

    def tearDown(self):
        if os.path.exists(self.dummy_image_path):
            os.remove(self.dummy_image_path)

    async def test_write_ble(self):
        data = b"test_data"
        await _write_ble(self.mock_client, PRINTER_CHARACTERISTIC_UUID, data)
        self.mock_client.write_gatt_char.assert_called_once_with(
            PRINTER_CHARACTERISTIC_UUID, data, response=True
        )

        # Test with chunking
        long_data = b"a" * 100
        with patch("printer.WRITE_CHUNK_SIZE", 10):
            await _write_ble(self.mock_client, PRINTER_CHARACTERISTIC_UUID, long_data)
            self.assertEqual(self.mock_client.write_gatt_char.call_count, 11) # 1 for initial, 10 for chunks

        # Test not connected
        self.mock_client.is_connected = False
        with self.assertRaises(PrinterConnectionError):
            await _write_ble(self.mock_client, PRINTER_CHARACTERISTIC_UUID, data)

    async def test_print_header(self):
        await print_header(self.mock_client, PRINTER_CHARACTERISTIC_UUID)
        self.mock_client.write_gatt_char.assert_called_once_with(
            PRINTER_CHARACTERISTIC_UUID, b"\x1b\x40\x1b\x61\x01\x1f\x11\x02\x04", response=True
        )

    async def test_print_marker(self):
        lines = 10
        await print_marker(self.mock_client, PRINTER_CHARACTERISTIC_UUID, lines)
        expected_calls = [
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, (0x761D).to_bytes(2, "little"), response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, (0x0030).to_bytes(2, "little"), response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, (0x0030).to_bytes(2, "little"), response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, (lines - 1).to_bytes(2, "little"), response=True),
        ]
        self.mock_client.write_gatt_char.assert_has_calls(expected_calls)

    async def test_print_footer(self):
        await print_footer(self.mock_client, PRINTER_CHARACTERISTIC_UUID)
        expected_calls = [
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, b"\x1b\x64\x02", response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, b"\x1b\x64\x02", response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, b"\x1f\x11\x08", response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, b"\x1f\x11\x0e", response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, b"\x1f\x11\x07", response=True),
            unittest.mock.call(PRINTER_CHARACTERISTIC_UUID, b"\x1f\x11\x09", response=True),
        ]
        self.mock_client.write_gatt_char.assert_has_calls(expected_calls)

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

    @patch("printer.time.sleep", new_callable=AsyncMock)
    @patch("printer._write_ble", new_callable=AsyncMock)
    @patch("printer.print_header", new_callable=AsyncMock)
    @patch("printer.print_marker", new_callable=AsyncMock)
    @patch("printer.print_footer", new_callable=AsyncMock)
    @patch("printer._line_bytes", MagicMock(return_value=b"\x00" * (PRINTER_WIDTH // 8)))
    async def test_print_image_from_pil(
        self,
        mock_print_footer,
        mock_print_marker,
        mock_print_header,
        mock_write_ble,
        mock_sleep,
    ):
        mock_on_progress = MagicMock()

        # Create a small image for testing to control loop iterations
        small_img = Image.new("1", (PRINTER_WIDTH, MAX_MARKER_LINES + 10), color=0)

        await print_image_from_pil(small_img, self.mock_client, PRINTER_CHARACTERISTIC_UUID, on_progress=mock_on_progress)

        # Verify header and footer are called
        mock_print_header.assert_called_once_with(self.mock_client, PRINTER_CHARACTERISTIC_UUID)
        mock_print_footer.assert_called_once_with(self.mock_client, PRINTER_CHARACTERISTIC_UUID)

        # Verify print_marker is called for each chunk
        expected_marker_calls = (small_img.height + MAX_MARKER_LINES - 1) // MAX_MARKER_LINES
        self.assertEqual(mock_print_marker.call_count, expected_marker_calls)

        # Verify _write_ble is called for image data
        self.assertTrue(mock_write_ble.called)

        # Verify on_progress is called
        self.assertTrue(mock_on_progress.called)
        # Check the last call to on_progress
        mock_on_progress.assert_called_with(small_img.height, small_img.height)

        # Verify sleep is called
        self.assertTrue(mock_sleep.called)

    @patch("printer.Image.open")
    @patch("printer.print_image_from_pil", new_callable=AsyncMock)
    async def test_print_image_from_path(self, mock_print_image_from_pil, mock_image_open):
        mock_on_progress = MagicMock()
        mock_image_instance = MagicMock()
        mock_image_open.return_value = mock_image_instance

        await print_image_from_path(self.dummy_image_path, self.mock_client, PRINTER_CHARACTERISTIC_UUID, on_progress=mock_on_progress)

        mock_image_open.assert_called_once_with(self.dummy_image_path)
        mock_print_image_from_pil.assert_called_once_with(
            mock_image_instance, self.mock_client, PRINTER_CHARACTERISTIC_UUID, on_progress=mock_on_progress
        )

    @patch("printer.Image.open")
    @patch("printer.print_image_from_pil", new_callable=AsyncMock)
    @patch("io.BytesIO")
    async def test_print_image_from_bytes(self, mock_bytesio, mock_print_image_from_pil, mock_image_open):
        mock_on_progress = MagicMock()
        dummy_bytes = b"dummy_image_bytes"
        mock_image_instance = MagicMock()
        mock_image_open.return_value = mock_image_instance
        mock_bytesio_instance = MagicMock()
        mock_bytesio.return_value = mock_bytesio_instance

        await print_image_from_bytes(dummy_bytes, self.mock_client, PRINTER_CHARACTERISTIC_UUID, on_progress=mock_on_progress)

        mock_bytesio.assert_called_once_with(dummy_bytes)
        mock_image_open.assert_called_once_with(mock_bytesio_instance)
        mock_print_image_from_pil.assert_called_once_with(
            mock_image_instance, self.mock_client, PRINTER_CHARACTERISTIC_UUID, on_progress=mock_on_progress
        )

    @patch("printer.BleakClient", autospec=True)
    @patch("printer.print_image_from_path", new_callable=AsyncMock)
    async def test_find_and_print(self, mock_print_image_from_path, MockBleakClient):
        mock_address = "XX:XX:XX:XX:XX:XX"
        mock_image_path = "path/to/image.png"
        mock_on_progress = MagicMock()

        # Configure the mock client
        mock_client_instance = MockBleakClient.return_value.__aenter__.return_value
        mock_client_instance.is_connected = True
        
        # Mock get_services to return a service and characteristic
        mock_service = MagicMock()
        mock_service.uuid = PRINTER_SERVICE_UUID
        mock_char = MagicMock()
        mock_char.uuid = PRINTER_CHARACTERISTIC_UUID
        mock_service.characteristics = [mock_char]
        mock_client_instance.get_services.return_value = [mock_service]

        await find_and_print(mock_address, mock_image_path, on_progress=mock_on_progress)

        MockBleakClient.assert_called_once_with(mock_address)
        mock_client_instance.get_services.assert_called_once()
        mock_print_image_from_path.assert_called_once_with(
            mock_image_path, mock_client_instance, PRINTER_CHARACTERISTIC_UUID, on_progress=mock_on_progress
        )

    @patch("printer.BleakClient", autospec=True)
    async def test_find_and_print_connection_error(self, MockBleakClient):
        mock_address = "XX:XX:XX:XX:XX:XX"
        mock_image_path = "path/to/image.png"

        mock_client_instance = MockBleakClient.return_value.__aenter__.return_value
        mock_client_instance.is_connected = False # Simulate connection failure

        with self.assertRaises(PrinterConnectionError):
            await find_and_print(mock_address, mock_image_path)
        
        MockBleakClient.assert_called_once_with(mock_address)

    @patch("printer.BleakClient", autospec=True)
    async def test_find_and_print_service_not_found(self, MockBleakClient):
        mock_address = "XX:XX:XX:XX:XX:XX"
        mock_image_path = "path/to/image.png"

        mock_client_instance = MockBleakClient.return_value.__aenter__.return_value
        mock_client_instance.is_connected = True
        mock_client_instance.get_services.return_value = [] # Simulate no services found

        with self.assertRaises(PrinterConnectionError) as cm:
            await find_and_print(mock_address, mock_image_path)
        self.assertIn("Printer service", str(cm.exception))

    @patch("printer.BleakClient", autospec=True)
    async def test_find_and_print_characteristic_not_found(self, MockBleakClient):
        mock_address = "XX:XX:XX:XX:XX:XX"
        mock_image_path = "path/to/image.png"

        mock_client_instance = MockBleakClient.return_value.__aenter__.return_value
        mock_client_instance.is_connected = True
        
        mock_service = MagicMock()
        mock_service.uuid = PRINTER_SERVICE_UUID
        mock_service.characteristics = [] # Simulate no characteristics found
        mock_client_instance.get_services.return_value = [mock_service]

        with self.assertRaises(PrinterConnectionError) as cm:
            await find_and_print(mock_address, mock_image_path)
        self.assertIn("Printer characteristic", str(cm.exception))


if __name__ == "__main__":
    # To run async tests, you need to use a test runner that supports it,
    # or wrap them in asyncio.run().
    # For simplicity in a CLI context, we'll run them directly if possible,
    # but a proper test setup would use pytest-asyncio or similar.
    # For now, we'll use a simple wrapper.
    def run_async_test(test_func):
        def wrapper(*args, **kwargs):
            return asyncio.run(test_func(*args, **kwargs))
        return wrapper

    for name in dir(TestPrinterFunctions):
        if name.startswith("test_") and asyncio.iscoroutinefunction(getattr(TestPrinterFunctions, name)):
            setattr(TestPrinterFunctions, name, run_async_test(getattr(TestPrinterFunctions, name)))

    unittest.main()