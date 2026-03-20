import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_ID ?? '';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const s3Key = key.join('/');

  if (!s3Key.startsWith('sessions/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const res = await fetch(`${API_BASE}/api/internal/images/${s3Key}`, {
    headers: { 'x-api-key': API_KEY },
  });

  if (!res.ok) {
    return new NextResponse('Image not found', { status: res.status });
  }

  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
