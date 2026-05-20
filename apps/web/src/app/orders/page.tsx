import Link from 'next/link';
import { fetchDashboardOrders, type DashboardOrder } from '@/lib/storefront-api';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--muted-foreground)',
  AWAITING_PAYMENT: '#d97706',
  PAID: '#2563eb',
  QUEUED: '#7c3aed',
  GENERATING: '#7c3aed',
  READY: '#059669',
  DELIVERED: 'var(--success)',
  FAILED: 'var(--error)',
  REFUNDED: 'var(--muted-foreground)',
};

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

interface OrdersPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

const STATUSES = ['', 'AWAITING_PAYMENT', 'PAID', 'GENERATING', 'READY', 'DELIVERED', 'FAILED'];
const STATUS_LABELS: Record<string, string> = {
  '': 'Todos', AWAITING_PAYMENT: 'Aguardando pag.', PAID: 'Pago', GENERATING: 'Gerando',
  READY: 'Pronto', DELIVERED: 'Entregue', FAILED: 'Falhou',
};
const PAGE_SIZE = 50;

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const status = params.status || '';
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let result;
  try {
    result = await fetchDashboardOrders({ status: status || undefined, limit: PAGE_SIZE, offset });
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar pedidos</p>
      </div>
    );
  }

  const { total, items } = result;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Pedidos</h2>
        <span className="text-sm text-[var(--muted-foreground)]">{total} total</span>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {STATUSES.map((s) => {
          const isActive = s === status;
          return (
            <Link
              key={s}
              href={s ? `/orders?status=${s}&page=1` : '/orders?page=1'}
              className="px-3 py-1 rounded-full text-sm transition-colors"
              style={{
                background: isActive ? 'var(--primary)' : 'var(--bg2)',
                color: isActive ? '#fff' : 'var(--foreground)',
              }}
            >
              {STATUS_LABELS[s] ?? s}
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg2)] text-[var(--muted-foreground)]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Plano</th>
              <th className="text-left px-4 py-3 font-medium">Destinatário</th>
              <th className="text-left px-4 py-3 font-medium">Contato</th>
              <th className="text-right px-4 py-3 font-medium">Valor</th>
              <th className="text-left px-4 py-3 font-medium">Afiliado</th>
              <th className="text-left px-4 py-3 font-medium">Qualidade</th>
              <th className="text-left px-4 py-3 font-medium">Criado em</th>
              <th className="text-left px-4 py-3 font-medium">Pago em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-[var(--muted-foreground)]">
                  Nenhum pedido encontrado.
                </td>
              </tr>
            ) : (
              items.map((o: DashboardOrder) => (
                <tr key={o.id} className="hover:bg-[var(--bg2)] transition-colors">
                  <td className="px-4 py-3 font-mono text-[var(--muted-foreground)]">{o.id}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: STATUS_COLOR[o.status] + '22', color: STATUS_COLOR[o.status] }}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{o.plan ?? '—'}</td>
                  <td className="px-4 py-3">{o.recipient_name ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">
                    {o.guest_phone ?? o.guest_email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(o.total_cents)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.affiliate_code
                      ? <span className="px-1.5 py-0.5 rounded bg-[var(--bg2)] border border-[var(--border)]">{o.affiliate_code}</span>
                      : <span className="text-[var(--muted-foreground)]">—</span>}
                  </td>
                  <td className="px-4 py-3 uppercase text-xs">{o.quality}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{fmtDate(o.paid_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-4 justify-end text-sm">
          {page > 1 && (
            <Link
              href={`/orders?${status ? `status=${status}&` : ''}page=${page - 1}`}
              className="px-3 py-1 rounded bg-[var(--bg2)] hover:bg-[var(--bg3)]"
            >
              ← Anterior
            </Link>
          )}
          <span className="text-[var(--muted-foreground)]">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/orders?${status ? `status=${status}&` : ''}page=${page + 1}`}
              className="px-3 py-1 rounded bg-[var(--bg2)] hover:bg-[var(--bg3)]"
            >
              Próximo →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
