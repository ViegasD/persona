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
  return res.json();
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
