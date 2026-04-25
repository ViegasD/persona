'use client';

import { useState } from 'react';

interface OrderItem {
  id: number;
  sequence: number;
  character_ids: string[];
  status: string;
  video_url: string | null;
}

interface Order {
  id: number;
  status: string;
  recipient_name: string | null;
  occasion_slug: string | null;
  items: OrderItem[];
  paid_at: string | null;
}

const STOREFRONT_BASE =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'https://hermes-persona-website.5tpiot.easypanel.host';

async function lookupOrders(contact: string): Promise<Order[]> {
  const isEmail = contact.includes('@');
  const param = isEmail ? `email=${encodeURIComponent(contact)}` : `phone=${encodeURIComponent(contact)}`;
  const res = await fetch(`${STOREFRONT_BASE}/api/v1/orders/lookup?${param}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erro ${res.status}`);
  }
  return res.json();
}

export default function MeusVideosPage() {
  const [contact, setContact] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim()) return;
    setLoading(true);
    setError(null);
    setOrders(null);
    setSearched(false);
    try {
      const result = await lookupOrders(contact.trim());
      setOrders(result);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar pedidos');
    } finally {
      setLoading(false);
    }
  }

  const readyItems = orders?.flatMap((o) =>
    o.items
      .filter((i) => i.video_url)
      .map((i) => ({ ...i, order: o }))
  ) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🎬 Meus Vídeos</h1>
      <p className="text-[var(--muted-foreground)] mb-8 text-sm">
        Digite o telefone ou e-mail que usou no pedido para acessar seus vídeos personalizados.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Telefone (+5511...) ou e-mail"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !contact.trim()}
          className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {error && (
        <p className="text-[var(--error)] text-sm mb-6">{error}</p>
      )}

      {searched && readyItems.length === 0 && (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">Nenhum vídeo encontrado.</p>
          <p className="text-sm mt-1">
            Verifique se o vídeo já foi aprovado e processado, ou tente com outro contato.
          </p>
        </div>
      )}

      {readyItems.length > 0 && (
        <div className="space-y-8">
          {readyItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--muted)]"
            >
              <div className="px-4 py-3 border-b border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                Para <strong className="text-[var(--foreground)]">{item.order.recipient_name ?? 'você'}</strong>
                {item.order.occasion_slug && ` · ${item.order.occasion_slug.replace(/-/g, ' ')}`}
              </div>
              <div className="aspect-[9/16] max-h-[70vh] bg-black flex items-center justify-center">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={item.video_url!}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="px-4 py-3 flex justify-end">
                <a
                  href={item.video_url!}
                  download={`video-personalizado-${item.id}.mp4`}
                  className="text-sm font-medium underline"
                  style={{ color: 'var(--primary)' }}
                >
                  ⬇ Baixar vídeo
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
