import 'server-only';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_API_ID ?? '';

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_ID };
}

// ─── Types ──────────────────────────────────────────────

export interface AdminOccasion {
  id: string;
  slug: string;
  label: string;
  promptHint: string;
  templateCount: number;
  createdAt: string;
}

export interface AdminTemplate {
  id: string;
  s3Key: string;
  scenePrompt: string;
  tags: string[];
  imageUrl: string | null;
  createdAt: string;
}

export interface OccasionTemplatesResponse {
  occasion: { id: string; slug: string; label: string };
  templates: AdminTemplate[];
}

// ─── Occasions ──────────────────────────────────────────

export async function fetchOccasions(): Promise<AdminOccasion[]> {
  const res = await fetch(`${API_BASE}/api/admin/occasions`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function createOccasion(data: { slug: string; label: string; promptHint?: string }): Promise<AdminOccasion> {
  const res = await fetch(`${API_BASE}/api/admin/occasions`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Templates ──────────────────────────────────────────

export async function fetchTemplates(slug: string): Promise<OccasionTemplatesResponse> {
  const res = await fetch(`${API_BASE}/api/admin/occasions/${encodeURIComponent(slug)}/templates`, {
    headers: headers(), cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function uploadTemplates(
  slug: string,
  images: Array<{ base64: string; filename?: string; mimeType?: string }>,
): Promise<{ created: number; templates: AdminTemplate[] }> {
  const res = await fetch(`${API_BASE}/api/admin/occasions/${encodeURIComponent(slug)}/templates`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ images }),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateTemplate(id: string, data: { scenePrompt?: string; tags?: string[] }) {
  const res = await fetch(`${API_BASE}/api/admin/templates/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function deleteTemplate(id: string) {
  const res = await fetch(`${API_BASE}/api/admin/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function regeneratePrompt(id: string) {
  const res = await fetch(`${API_BASE}/api/admin/templates/${encodeURIComponent(id)}/regenerate-prompt`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function seedOccasions(): Promise<{ created: number; total: number }> {
  const res = await fetch(`${API_BASE}/api/admin/seed-occasions`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function syncTemplates(): Promise<{ synced: number }> {
  const res = await fetch(`${API_BASE}/api/admin/sync-templates`, {
    method: 'POST', headers: headers(),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}
