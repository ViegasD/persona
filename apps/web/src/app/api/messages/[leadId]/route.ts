import { fetchMessages } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;
  const url = new URL(_request.url);
  const after = url.searchParams.get('after') ?? undefined;
  const limit = Number(url.searchParams.get('limit')) || 50;

  try {
    const result = await fetchMessages(leadId, limit, undefined);
    // Filter client-side by `after` timestamp to get only new messages
    const messages = after
      ? result.messages.filter((m) => new Date(m.createdAt) > new Date(after))
      : result.messages;

    return Response.json({ messages });
  } catch {
    return Response.json({ messages: [] }, { status: 502 });
  }
}
