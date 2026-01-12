"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Status from './Status';

export default function Header() {
  const pathname = usePathname();

  const navLinkClasses = (path: string) => {
    return `px-2.5 py-1.5 rounded no-underline text-gray-800 ${pathname === path ? 'bg-gray-100' : ''}`;
  };

  return (
    <header className="flex flex-wrap items-center gap-3">
      <h2 className="m-0 text-xl font-semibold">Phomemo Printer</h2>
      <Status />
      <nav className="flex gap-1 border border-gray-300 rounded-md p-1">
        <Link href="/image" className={navLinkClasses('/image')}>Image</Link>
        <Link href="/markdown" className={navLinkClasses('/markdown')}>Markdown</Link>
        <Link href="/template" className={navLinkClasses('/template')}>Template</Link>
        <Link href="/calendar" className={navLinkClasses('/calendar')}>Calendar</Link>
        <Link href="/qr-code" className={navLinkClasses('/qr-code')}>QR Code</Link>
      </nav>
    </header>
  );
}