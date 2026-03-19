const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? '';

function adminHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': ADMIN_KEY,
  };
}

// ─── Types ──────────────────────────────────────────────────

export interface AdminImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  sequence: number;
  isApproved: boolean;
}

export interface AdminPayment {
  id: string;
  status: string;
  amount: number;
}

export interface AdminSession {
  id: string;
  funnelState: string;
  preferences: Record<string, unknown>;
  generatedImages: AdminImage[];
  payments: AdminPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminLead {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  source: string | null;
  sessions: AdminSession[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// ─── API Functions ──────────────────────────────────────────

export async function fetchLeads(
  page = 1,
  status?: string,
): Promise<PaginatedResponse<AdminLead>> {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);

  const res = await fetch(`${API_BASE}/api/admin/leads?${params}`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function fetchLead(id: string): Promise<AdminLead> {
  const res = await fetch(`${API_BASE}/api/admin/leads/${encodeURIComponent(id)}`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function approveAllImages(
  sessionId: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(
    `${API_BASE}/api/admin/sessions/${encodeURIComponent(sessionId)}/approve-all`,
    { method: 'POST', headers: adminHeaders() },
  );
  return res.json();
}

export async function regenerateImage(
  imageId: string,
): Promise<{ success: boolean; generationJobId?: string }> {
  const res = await fetch(
    `${API_BASE}/api/admin/images/${encodeURIComponent(imageId)}/regenerate`,
    { method: 'POST', headers: adminHeaders() },
  );
  return res.json();
}
