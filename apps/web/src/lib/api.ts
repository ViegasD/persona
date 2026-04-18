import 'server-only';

const API_BASE = process.env.ADMIN_API_URL ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_API_ID ?? '';

function adminHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': ADMIN_ID,
  };
}

// Helper for POSTs with no body
function adminPostHeaders(): HeadersInit {
  return {
    'X-API-Key': ADMIN_ID,
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

export interface AdminVideo {
  id: string;
  url: string;
  sequence: number;
  isApproved: boolean;
  durationSeconds: number | null;
}

export interface AdminPayment {
  id: string;
  status: string;
  amount: number;
}

export interface AdminRefImage {
  id: string;
  url: string;
}

export interface AdminSession {
  id: string;
  funnelState: string;
  aiEnabled: boolean;
  preferences: Record<string, unknown>;
  metadata: Record<string, unknown>;
  referenceImages: AdminRefImage[];
  generatedImages: AdminImage[];
  generatedVideos: AdminVideo[];
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
    { method: 'POST', headers: adminPostHeaders() },
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

export async function generateSession(
  sessionId: string,
): Promise<{ success: boolean; generationJobId?: string }> {
  const res = await fetch(
    `${API_BASE}/api/admin/sessions/${encodeURIComponent(sessionId)}/generate`,
    { method: 'POST', headers: adminPostHeaders() },
  );
  return res.json();
}

// ─── Chat API Functions ─────────────────────────────────────

export interface ChatMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function fetchMessages(
  leadId: string,
  limit = 50,
  before?: string,
): Promise<{ messages: ChatMessage[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);

  const res = await fetch(
    `${API_BASE}/api/admin/leads/${encodeURIComponent(leadId)}/messages?${params}`,
    { headers: adminHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function sendAdminMessage(
  leadId: string,
  content: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/admin/leads/${encodeURIComponent(leadId)}/messages`,
    {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function toggleAi(
  leadId: string,
  enabled: boolean,
): Promise<{ success: boolean; aiEnabled: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/admin/leads/${encodeURIComponent(leadId)}/ai`,
    {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}
