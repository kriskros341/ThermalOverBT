import { NextResponse } from 'next/server';

const PRINTING_SERVICE_URL = process.env.PRINTING_SERVICE_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const res = await fetch(`${PRINTING_SERVICE_URL}/status`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
