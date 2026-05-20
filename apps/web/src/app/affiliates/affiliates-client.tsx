'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AffiliateOut } from '@/lib/storefront-api';
import { createAffiliateAction, updateAffiliateAction } from '@/lib/storefront-actions';

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

const STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'https://recadoanimado.com';

export function AffiliatesClient({ affiliates: initial }: { affiliates: AffiliateOut[] }) {
  const router = useRouter();
  const [affiliates, setAffiliates] = useState(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', commission_pct: '20' });

  // Per-row edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', commission_pct: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    const pct = parseFloat(form.commission_pct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setCreateError('Comissão deve ser entre 0 e 100.');
      setCreating(false);
      return;
    }
    const res = await createAffiliateAction({
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      commission_pct: pct,
    });
    setCreating(false);
    if (res.ok) {
      setShowCreate(false);
      setForm({ name: '', email: '', commission_pct: '20' });
      router.refresh();
    } else {
      setCreateError(res.error ?? 'Erro ao criar afiliado.');
    }
  }

  function startEdit(aff: AffiliateOut) {
    setEditId(aff.id);
    setEditForm({
      name: aff.name,
      email: aff.email ?? '',
      commission_pct: String(aff.commission_pct),
      is_active: aff.is_active,
    });
    setSaveError('');
  }

  async function handleSave(id: number) {
    setSaving(true);
    setSaveError('');
    const pct = parseFloat(editForm.commission_pct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setSaveError('Comissão deve ser entre 0 e 100.');
      setSaving(false);
      return;
    }
    const res = await updateAffiliateAction(id, {
      name: editForm.name.trim(),
      email: editForm.email.trim() || undefined,
      commission_pct: pct,
      is_active: editForm.is_active,
    });
    setSaving(false);
    if (res.ok) {
      setEditId(null);
      router.refresh();
    } else {
      setSaveError(res.error ?? 'Erro ao salvar.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Create form toggle */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90"
        >
          + Novo afiliado
        </button>
      ) : (
        <form
          onSubmit={handleCreate}
          className="border border-[var(--border)] rounded-xl p-5 space-y-3 bg-[var(--bg2)] max-w-lg"
        >
          <h3 className="font-semibold text-sm">Novo afiliado</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Nome *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] w-full"
            />
            <input
              type="email"
              placeholder="E-mail (opcional)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] w-full"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--muted-foreground)]">Comissão %:</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.commission_pct}
              onChange={(e) => setForm({ ...form, commission_pct: e.target.value })}
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] w-24"
            />
          </div>
          {createError && <p className="text-[var(--error)] text-sm">{createError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Criando…' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--bg2)]"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg2)] text-[var(--muted-foreground)] text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Código / Link</th>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Comissão</th>
              <th className="px-4 py-3 font-medium">Pedidos</th>
              <th className="px-4 py-3 font-medium">Total ganho</th>
              <th className="px-4 py-3 font-medium">A pagar</th>
              <th className="px-4 py-3 font-medium">Ativo</th>
              <th className="px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {affiliates.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                  Nenhum afiliado cadastrado.
                </td>
              </tr>
            )}
            {affiliates.map((aff) => (
              <tr key={aff.id} className="border-t border-[var(--border)] hover:bg-[var(--bg2)]/50">
                {editId === aff.id ? (
                  // Edit mode
                  <>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">
                      {aff.code}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--background)] w-full"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--background)] w-full"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={editForm.commission_pct}
                        onChange={(e) => setEditForm({ ...editForm, commission_pct: e.target.value })}
                        className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--background)] w-20"
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{aff.total_orders}</td>
                    <td className="px-4 py-3">{fmt(aff.total_earnings_cents)}</td>
                    <td className="px-4 py-3 font-medium">{fmt(aff.unpaid_earnings_cents)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(aff.id)}
                          disabled={saving}
                          className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? '…' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg2)]"
                        >
                          Cancelar
                        </button>
                      </div>
                      {saveError && <p className="text-[var(--error)] text-xs mt-1">{saveError}</p>}
                    </td>
                  </>
                ) : (
                  // View mode
                  <>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold">{aff.code}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-[var(--muted-foreground)] truncate max-w-[140px]">
                          {STOREFRONT}/?ref={aff.code}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${STOREFRONT}/?ref=${aff.code}`);
                            setCopiedId(aff.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg2)] text-[var(--muted-foreground)]"
                          title="Copiar link"
                        >
                          {copiedId === aff.id ? '✓' : '📋'}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{aff.name}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{aff.email ?? '—'}</td>
                    <td className="px-4 py-3">{aff.commission_pct}%</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/affiliates/${aff.id}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {aff.total_orders}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{fmt(aff.total_earnings_cents)}</td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        aff.unpaid_earnings_cents > 0 ? 'text-[var(--warning)]' : ''
                      }`}
                    >
                      {fmt(aff.unpaid_earnings_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          aff.is_active ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(aff)}
                          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg2)]"
                        >
                          Editar
                        </button>
                        <Link
                          href={`/affiliates/${aff.id}`}
                          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg2)]"
                        >
                          Pedidos
                        </Link>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
