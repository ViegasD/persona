import 'server-only';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_API_ID ?? '';

function adminHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': ADMIN_ID,
  };
}

export interface AdminSettings {
  settings: Record<string, string>;
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data: AdminSettings = await res.json();
  return data.settings;
}

export async function updateSettings(
  settings: Record<string, string>,
): Promise<{ success: boolean; updated: Record<string, string> }> {
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Erro ${res.status}` }));
    throw new Error(err.error ?? `Erro ${res.status}`);
  }
  return res.json();
}
