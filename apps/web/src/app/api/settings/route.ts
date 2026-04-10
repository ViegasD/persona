import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_API_ID ?? '';

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': ADMIN_ID,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
