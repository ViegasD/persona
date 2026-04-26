import { fetchDashboardSummary, fetchApiCosts } from '@/lib/storefront-api';

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function fmtUsd(microUsd: number) {
  return `$${(microUsd / 1_000_000).toFixed(2)}`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg2)] p-5">
      <p className="text-sm text-[var(--muted-foreground)] mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</p>}
    </div>
  );
}

export default async function FinancePage() {
  let summary;
  let costs;
  try {
    [summary, costs] = await Promise.all([fetchDashboardSummary(), fetchApiCosts(30)]);
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar dados financeiros</p>
      </div>
    );
  }

  const { revenue_cents, order_counts, conversion, api_cost_micro_usd } = summary;

  // Aggregate total API costs per provider
  const allProviders = Array.from(
    new Set(costs.map((r) => r.provider))
  ).sort();

  // Group daily costs by day for the table
  const days = Array.from(new Set(costs.map((r) => r.day))).sort().reverse().slice(0, 14);

  const costByDayProvider: Record<string, Record<string, number>> = {};
  for (const row of costs) {
    if (!costByDayProvider[row.day]) costByDayProvider[row.day] = {};
    costByDayProvider[row.day][row.provider] =
      (costByDayProvider[row.day][row.provider] ?? 0) + row.cost_micro_usd;
  }

  const totalApiCostToday = Object.values(api_cost_micro_usd.today).reduce((a, b) => a + b, 0);
  const totalApiCostWeek = Object.values(api_cost_micro_usd.week).reduce((a, b) => a + b, 0);
  const totalApiCostMonth = Object.values(api_cost_micro_usd.month).reduce((a, b) => a + b, 0);
  const totalApiCostAll = Object.values(api_cost_micro_usd.total).reduce((a, b) => a + b, 0);

  // Rough margin: revenue - api costs
  const marginCents = revenue_cents.month - Math.round(totalApiCostMonth / 10000);

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Financeiro</h2>

      {/* Revenue cards */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
          Receita
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Hoje" value={fmt(revenue_cents.today)} />
          <StatCard label="Esta semana" value={fmt(revenue_cents.week)} />
          <StatCard label="Este mês" value={fmt(revenue_cents.month)} sub={`Margem ~${fmt(marginCents)}`} />
          <StatCard label="Total" value={fmt(revenue_cents.total)} />
        </div>
      </section>

      {/* Conversion + order status */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
          Funil
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Conversão"
            value={`${conversion.rate_pct}%`}
            sub={`${conversion.paid_orders} pagos / ${conversion.total_orders} total`}
          />
          {(['DRAFT', 'AWAITING_PAYMENT', 'PAID', 'DELIVERED', 'FAILED'] as const).map((s) => (
            <StatCard key={s} label={s} value={String(order_counts[s] ?? 0)} />
          ))}
        </div>
      </section>

      {/* API cost summary */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">
          Custos de API
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Hoje" value={fmtUsd(totalApiCostToday)} />
          <StatCard label="Esta semana" value={fmtUsd(totalApiCostWeek)} />
          <StatCard label="Este mês" value={fmtUsd(totalApiCostMonth)} />
          <StatCard label="Total" value={fmtUsd(totalApiCostAll)} />
        </div>

        {/* Per-provider totals */}
        {allProviders.length > 0 && (
          <div className="flex gap-4 flex-wrap mb-6">
            {allProviders.map((p) => (
              <div
                key={p}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg2)] px-4 py-3 text-sm"
              >
                <span className="font-semibold capitalize">{p}</span>
                <span className="ml-2 text-[var(--muted-foreground)]">
                  {fmtUsd(api_cost_micro_usd.total[p] ?? 0)} total
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Daily breakdown table */}
        {days.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg2)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Dia</th>
                  {allProviders.map((p) => (
                    <th key={p} className="text-right px-4 py-3 font-medium capitalize">
                      {p}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {days.map((day) => {
                  const row = costByDayProvider[day] ?? {};
                  const dayTotal = Object.values(row).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={day} className="hover:bg-[var(--bg2)] transition-colors">
                      <td className="px-4 py-3 font-mono">{day}</td>
                      {allProviders.map((p) => (
                        <td key={p} className="px-4 py-3 text-right text-[var(--muted-foreground)]">
                          {row[p] ? fmtUsd(row[p]) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-medium">{fmtUsd(dayTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[var(--muted-foreground)] text-sm">Nenhum custo registrado nos últimos 30 dias.</p>
        )}
      </section>
    </div>
  );
}
