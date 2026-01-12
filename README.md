# Phomemo Printer Web UI

This project provides a web interface for Phomemo thermal printers. It consists of a Next.js frontend and a Python-based printing microservice.

## Architecture

The project is now a monorepo with two main components:

-   `next-frontend`: A Next.js application that provides the user interface.
-   `printing-service`: A FastAPI application that handles the communication with the printer via Bluetooth.

The Next.js frontend communicates with the printing service using server actions and API routes, which in turn make HTTP requests to the FastAPI service.

## Running the Application

You need to run both the frontend and the printing service simultaneously.

### 1. Running the Printing Service

The printing service is a Python application that uses FastAPI and PyBluez.

**Prerequisites:**

-   Python 3
-   Bluetooth development libraries (`sudo apt-get install libbluetooth-dev`)

**Setup:**

1.  Navigate to the `printing-service` directory:
    ```bash
    cd printing-service
    ```
2.  Install the Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Find the MAC address of your printer:
    ```bash
    bluetoothctl paired-devices
    ```
4.  Run the printing service, replacing the MAC address with your printer's address:
    ```bash
    PRINTER_MAC=DC:0D:30:C1:01:35 uvicorn app:app --host 0.0.0.0 --port 8000
    ```

### 2. Running the Frontend

The frontend is a Next.js application.

**Prerequisites:**

-   Node.js
-   npm

**Setup:**

1.  Navigate to the `next-frontend` directory:
    ```bash
    cd next-frontend
    ```
2.  Install the Node.js dependencies:
    ```bash
    npm install
    ```
3.  Run the frontend development server:
    ```bash
    npm run dev
    ```

The frontend will be available at `http://localhost:3000`.

## License

This software is licensed under the GPLv3. You can use, modify, and share this software freely. If you distribute it (or your modifications), you must include the source, keep it under GPLv3, and preserve copyright notices.
