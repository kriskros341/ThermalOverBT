import { NextResponse } from 'next/server';

const PRINTING_SERVICE_URL = process.env.PRINTING_SERVICE_URL || 'http://localhost:8000';

export async function POST() {
  try {
    const res = await fetch(`${PRINTING_SERVICE_URL}/disconnect`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}