'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AffiliateOut, AffiliateOrderOut } from '@/lib/storefront-api';
import { markCommissionPaidAction, updateAffiliateAction } from '@/lib/storefront-actions';

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const STOREFRONT = 'https://recadoanimado.com.br';

export function AffiliateDetailClient({
  affiliate: initial,
  orders: initialOrders,
}: {
  affiliate: AffiliateOut;
  orders: AffiliateOrderOut[];
}) {
  const router = useRouter();
  const [affiliate, setAffiliate] = useState(initial);
  const [orders, setOrders] = useState(initialOrders);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: initial.name,
    email: initial.email ?? '',
    commission_pct: String(initial.commission_pct),
    is_active: initial.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [paying, setPaying] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    setEditError('');
    const pct = parseFloat(editForm.commission_pct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setEditError('Comissão deve ser entre 0 e 100.');
      setSaving(false);
      return;
    }
    const res = await updateAffiliateAction(affiliate.id, {
      name: editForm.name.trim(),
      email: editForm.email.trim() || undefined,
      commission_pct: pct,
      is_active: editForm.is_active,
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setEditError(res.error ?? 'Erro ao salvar.');
    }
  }

  async function handleMarkPaid(orderId: number) {
    setPaying(orderId);
    const res = await markCommissionPaidAction(affiliate.id, orderId);
    setPaying(null);
    if (res.ok) {
      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === orderId
            ? { ...o, commission_paid_out: true, commission_paid_out_at: new Date().toISOString() }
            : o
        )
      );
    } else {
      alert(res.error ?? 'Erro ao marcar como pago.');
    }
  }

  const totalUnpaid = orders
    .filter((o) => !o.commission_paid_out)
    .reduce((sum, o) => sum + o.commission_cents, 0);

  const totalEarned = orders.reduce((sum, o) => sum + o.commission_cents, 0);

  return (
    <div className="space-y-6">
      {/* Affiliate info card */}
      <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--bg2)] space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{affiliate.name}</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">{affiliate.email ?? '—'}</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg font-bold">{affiliate.code}</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Link: {STOREFRONT}/?ref={affiliate.code}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[var(--muted-foreground)]">Comissão</p>
            <p className="font-semibold">{affiliate.commission_pct}%</p>
          </div>
          <div>
            <p className="text-[var(--muted-foreground)]">Pedidos pagos</p>
            <p className="font-semibold">{orders.length}</p>
          </div>
          <div>
            <p className="text-[var(--muted-foreground)]">Total ganho</p>
            <p className="font-semibold">{fmt(totalEarned)}</p>
          </div>
          <div>
            <p className="text-[var(--muted-foreground)]">A pagar</p>
            <p className={`font-semibold ${totalUnpaid > 0 ? 'text-[var(--warning)]' : ''}`}>
              {fmt(totalUnpaid)}
            </p>
          </div>
        </div>

        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--background)]"
          >
            Editar
          </button>
        ) : (
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-lg">
              <input
                placeholder="Nome *"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
              />
              <input
                type="email"
                placeholder="E-mail"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-[var(--muted-foreground)]">Comissão %:</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={editForm.commission_pct}
                  onChange={(e) => setEditForm({ ...editForm, commission_pct: e.target.value })}
                  className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] w-24"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                Ativo
              </label>
            </div>
            {editError && <p className="text-[var(--error)] text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--background)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div>
        <h3 className="font-semibold mb-3">Pedidos atribuídos</h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg2)] text-[var(--muted-foreground)] text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Comissão</th>
                <th className="px-4 py-3 font-medium">Pago em</th>
                <th className="px-4 py-3 font-medium">Repasse</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                    Nenhum pedido pago atribuído a este afiliado.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.order_id} className="border-t border-[var(--border)] hover:bg-[var(--bg2)]/50">
                  <td className="px-4 py-3 font-mono text-xs">#{o.order_id}</td>
                  <td className="px-4 py-3">{o.recipient_name ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{o.guest_phone ?? '—'}</td>
                  <td className="px-4 py-3">{fmt(o.total_cents)}</td>
                  <td className="px-4 py-3 font-medium">
                    {fmt(o.commission_cents)}
                    <span className="text-xs text-[var(--muted-foreground)] ml-1">({o.commission_pct}%)</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{fmtDate(o.paid_at)}</td>
                  <td className="px-4 py-3">
                    {o.commission_paid_out ? (
                      <span className="text-green-600 font-medium">
                        Pago {fmtDate(o.commission_paid_out_at)}
                      </span>
                    ) : (
                      <span className="text-[var(--warning)]">Pendente</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3">
                    {!o.commission_paid_out && (
                      <button
                        onClick={() => handleMarkPaid(o.order_id)}
                        disabled={paying === o.order_id}
                        className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {paying === o.order_id ? '…' : 'Marcar pago'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
