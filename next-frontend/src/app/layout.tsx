import type { Metadata } from "next";
import Header from "@/components/Header";
import PrintHistory from "@/components/PrintHistory";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phomemo Printer",
  description: "Web interface for Phomemo printers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="p-3">
          <Header />
          <main className="mt-3">
            {children}
          </main>
          <footer className="mt-2 text-xs text-gray-600">
            <div>Tips: Printer width is 384 px. The server resizes and converts to 1-bit automatically.</div>
            <PrintHistory />
          </footer>
        </div>
      </body>
    </html>
  );
}