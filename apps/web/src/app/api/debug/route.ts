import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_ID ?? '';

/**
 * Diagnostic endpoint — tests image proxy connectivity.
 * GET /manager/api/debug?key=<api-key>&s3key=sessions/...
 */
export async function GET(request: NextRequest) {
  const reqKey = request.nextUrl.searchParams.get('key') ?? '';
  if (!reqKey || reqKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s3Key = request.nextUrl.searchParams.get('s3key') ?? '';
  const url = `${API_BASE}/api/internal/images/${s3Key}`;

  const diag: Record<string, unknown> = {
    API_BASE,
    API_KEY_SET: !!API_KEY,
    API_KEY_LENGTH: API_KEY.length,
    targetUrl: url,
  };

  if (!s3Key) {
    return NextResponse.json({ ...diag, note: 'Pass ?s3key= to test image fetch' });
  }

  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': API_KEY },
      cache: 'no-store',
    });

    diag.backendStatus = res.status;
    diag.backendContentType = res.headers.get('content-type');
    diag.backendContentLength = res.headers.get('content-length');

    if (!res.ok) {
      diag.backendBody = await res.text().catch(() => '(unreadable)');
    } else {
      const buf = await res.arrayBuffer();
      diag.imageBytes = buf.byteLength;
    }
  } catch (err) {
    diag.fetchError = String(err);
  }

  return NextResponse.json(diag);
}
