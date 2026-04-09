import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_ID ?? '';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = `${API_BASE}/api/admin/template-image/${encodeURIComponent(id)}`;

  console.log(`[template-image proxy] id=${id} → ${url}`);

  const res = await fetch(url, {
    headers: { 'X-API-Key': ADMIN_KEY },
  });

  if (!res.ok) {
    console.error(`[template-image proxy] upstream ${res.status} for id=${id}`);
    return new NextResponse(null, { status: res.status });
  }

  console.log(`[template-image proxy] OK id=${id} content-type=${res.headers.get('Content-Type')}`);

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
