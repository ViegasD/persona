import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_ID ?? '';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const s3Key = key.join('/');

  if (!s3Key.startsWith('sessions/') && !s3Key.startsWith('characters/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const url = `${API_BASE}/api/internal/images/${s3Key}`;

  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': API_KEY },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[image-proxy] Backend ${res.status}: ${url} — ${body}`);
      return new NextResponse(`Upstream error ${res.status}`, { status: 502 });
    }

    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error(`[image-proxy] Fetch failed: ${url}`, err);
    return new NextResponse(`Proxy error: ${String(err)}`, { status: 502 });
  }
}
