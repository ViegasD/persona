import { NextRequest, NextResponse } from 'next/server';

const STOREFRONT_BASE = process.env.STOREFRONT_API_URL ?? 'http://localhost:8000';
const STOREFRONT_KEY = process.env.STOREFRONT_ADMIN_KEY ?? '';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;

  if (!/^\d+$/.test(itemId)) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const url = `${STOREFRONT_BASE}/api/v1/admin/items/${itemId}/preview`;

  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': STOREFRONT_KEY },
      cache: 'no-store',
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    return new NextResponse(res.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error(`[preview-proxy] fetch failed for item ${itemId}:`, err);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
