import 'server-only';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_API_ID ?? '';

function headers(json = true): HeadersInit {
  const h: Record<string, string> = { 'X-API-Key': ADMIN_ID };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// ─── Types ──────────────────────────────────────────────

export interface AdminCharacter {
  id: string;
  name: string;
  slug: string;
  personality: string | null;
  franchise: string | null;
  tags: string[];
  gender: string | null;
  ageRange: string | null;
  isActive: boolean;
  referenceImageCount: number;
  previewUrl: string | null;
  createdAt: string;
}

export interface AdminCharacterDetail {
  id: string;
  name: string;
  slug: string;
  personality: string | null;
  franchise: string | null;
  tags: string[];
  gender: string | null;
  ageRange: string | null;
  isActive: boolean;
  referenceImageS3Keys: string[];
  referenceImages: Array<{ s3Key: string; url: string }>;
  createdAt: string;
}

// ─── API ────────────────────────────────────────────────

export async function fetchCharacters(): Promise<AdminCharacter[]> {
  const res = await fetch(`${API_BASE}/api/admin/characters`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function fetchCharacter(id: string): Promise<AdminCharacterDetail> {
  const res = await fetch(`${API_BASE}/api/admin/characters/${encodeURIComponent(id)}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function createCharacter(data: {
  name: string;
  slug?: string;
  personality?: string;
  franchise?: string;
  tags?: string[];
  gender?: string;
  ageRange?: string;
}): Promise<AdminCharacterDetail> {
  const res = await fetch(`${API_BASE}/api/admin/characters`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateCharacter(
  id: string,
  data: {
    name?: string;
    personality?: string;
    franchise?: string;
    tags?: string[];
    gender?: string;
    ageRange?: string;
    isActive?: boolean;
  },
): Promise<AdminCharacterDetail> {
  const res = await fetch(`${API_BASE}/api/admin/characters/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function uploadCharacterImage(
  id: string,
  image: { base64: string; filename?: string; mimeType?: string },
): Promise<{ s3Key: string; url: string }> {
  const res = await fetch(`${API_BASE}/api/admin/characters/${encodeURIComponent(id)}/images`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(image),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function deleteCharacterImage(
  id: string,
  s3Key: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/characters/${encodeURIComponent(id)}/images`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ s3Key }),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function deactivateCharacter(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/characters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(false),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}
