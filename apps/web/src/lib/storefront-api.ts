import 'server-only';

const STOREFRONT_BASE = process.env.STOREFRONT_API_URL ?? 'http://localhost:8000';
const STOREFRONT_KEY = process.env.STOREFRONT_ADMIN_KEY ?? '';

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': STOREFRONT_KEY,
  };
}

export interface PendingItem {
  item_id: number;
  order_id: number;
  sequence: number;
  character_ids: string[];
  recipient_name: string | null;
  recipient_age: string | null;
  occasion_slug: string | null;
  is_multi_character: boolean;
  preview_type: 'image' | 'video';
  preview_url: string | null;
  updated_at: string;
}

export async function fetchPendingApprovals(): Promise<PendingItem[]> {
  const res = await fetch(`${STOREFRONT_BASE}/api/v1/admin/items/pending-approval?limit=100`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Storefront ${res.status}`);
  const items: PendingItem[] = await res.json();
  // preview_url is already a public HTTPS signed-token URL from the storefront
  // (/api/v1/media/{token}) — pass it straight through, no rewrite needed.
  return items;
}

export async function approveStorefrontItem(itemId: number): Promise<{ item_id: number; status: string }> {
  const res = await fetch(`${STOREFRONT_BASE}/api/v1/admin/items/${itemId}/approve`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro ${res.status}`);
  }
  return res.json();
}

export async function rejectStorefrontItem(itemId: number): Promise<{ item_id: number; status: string }> {
  const res = await fetch(`${STOREFRONT_BASE}/api/v1/admin/items/${itemId}/reject`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro ${res.status}`);
  }
  return res.json();
}

export async function retryStorefrontItem(itemId: number): Promise<{ item_id: number; status: string }> {
  const res = await fetch(`${STOREFRONT_BASE}/api/v1/admin/items/${itemId}/retry`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro ${res.status}`);
  }
  return res.json();
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface DashboardSummary {
  revenue_cents: { total: number; today: number; week: number; month: number };
  order_counts: Record<string, number>;
  conversion: { total_orders: number; paid_orders: number; rate_pct: number };
  api_cost_micro_usd: {
    total: Record<string, number>;
    today: Record<string, number>;
    week: Record<string, number>;
    month: Record<string, number>;
  };
}

export interface DashboardOrder {
  id: number;
  status: string;
  plan: string | null;
  plan_slug: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  recipient_name: string | null;
  total_cents: number;
  quality: string;
  video_count: number;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  error: string | null;
}

export interface DashboardOrdersResponse {
  total: number;
  items: DashboardOrder[];
}

export interface ApiCostRow {
  day: string;
  provider: string;
  cost_micro_usd: number;
  calls: number;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${STOREFRONT_BASE}/api/v1/admin/dashboard/summary`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Storefront ${res.status}`);
  return res.json();
}

export async function fetchDashboardOrders(
  opts: { status?: string; limit?: number; offset?: number } = {}
): Promise<DashboardOrdersResponse> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(
    `${STOREFRONT_BASE}/api/v1/admin/dashboard/orders${qs ? `?${qs}` : ''}`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Storefront ${res.status}`);
  return res.json();
}

export async function fetchApiCosts(days = 30): Promise<ApiCostRow[]> {
  const res = await fetch(
    `${STOREFRONT_BASE}/api/v1/admin/dashboard/api-costs?days=${days}`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Storefront ${res.status}`);
  return res.json();
}

