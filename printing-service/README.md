Printer service

This service connects to a Phomemo printer via Bluetooth RFCOMM using standard Python sockets.

To build the Docker image:

> docker build --no-cache -t printing-service .

To run the printer service, you must provide the printer's MAC address via the `PRINTER_MAC` environment variable. Optionally, you can specify the RFCOMM channel with `PRINTER_RFCOMM_CHANNEL` (defaults to 1).

> docker run --rm -it --network host -e PRINTER_MAC=DC:0D:30:C1:01:35 printing-service:latest

The `--network host` flag is necessary for Bluetooth communication within the Docker container.