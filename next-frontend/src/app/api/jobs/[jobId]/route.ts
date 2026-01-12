import { NextRequest, NextResponse } from 'next/server';

const PRINTING_SERVICE_URL = process.env.PRINTING_SERVICE_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  try {
    const res = await fetch(`${PRINTING_SERVICE_URL}/jobs/${jobId}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
