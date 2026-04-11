export const dynamic = 'force-dynamic';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_API_ID ?? '';

/**
 * Proxy SSE events from the backend to the browser.
 * Next.js Route Handler → backend GET /api/admin/events
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId') ?? '';

  const backendUrl = `${API_BASE}/api/admin/events${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ''}`;

  const upstream = await fetch(backendUrl, {
    headers: { 'X-API-Key': ADMIN_ID, Accept: 'text/event-stream' },
    cache: 'no-store',
    // @ts-expect-error -- Next.js/node supports duplex but TS doesn't know
    duplex: 'half',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('SSE upstream error', { status: 502 });
  }

  // Pass through the SSE stream
  return new Response(upstream.body as ReadableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
