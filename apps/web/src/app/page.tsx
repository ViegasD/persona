import Link from 'next/link';
import { fetchLeads } from '@/lib/api';
import { AutoRefresh } from '@/components/auto-refresh';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Novo', color: 'var(--muted-foreground)' },
  QUALIFIED: { label: 'Qualificado', color: 'var(--primary)' },
  COLLECTING: { label: 'Coletando', color: 'var(--warning)' },
  PAYING: { label: 'Pagando', color: 'var(--warning)' },
  PAID: { label: 'Pago', color: 'var(--success)' },
  GENERATING: { label: 'Gerando', color: 'var(--primary)' },
  APPROVING: { label: 'Aprovando', color: 'var(--warning)' },
  DELIVERED: { label: 'Entregue', color: 'var(--success)' },
  CHURNED: { label: 'Perdido', color: 'var(--error)' },
};

interface HomePageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = params.status;

  let result;
  try {
    result = await fetchLeads(page, status);
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar clientes</p>
        <p className="text-[var(--muted-foreground)] mt-2">Verifique se o backend está rodando e a chave de admin está configurada.</p>
      </div>
    );
  }

  const { data: leads, pagination } = result;
  const statuses = ['', 'NEW', 'PAID', 'GENERATING', 'APPROVING', 'DELIVERED', 'CHURNED'];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Clientes</h2>
        <AutoRefresh interval={10_000} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Status:</span>
        {statuses.map((s) => {
          const isActive = (s === '' && !status) || s === status;
          const label = s === '' ? 'Todos' : STATUS_LABELS[s]?.label ?? s;
          return (
            <Link
              key={s}
              href={s ? `/?status=${s}&page=1` : '/?page=1'}
              className="px-3 py-1 rounded-full text-sm transition-colors"
              style={{
                background: isActive ? 'var(--primary)' : 'var(--muted)',
                color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Client list */}
      {leads.length === 0 ? (
        <p className="text-center text-[var(--muted-foreground)] py-16">Nenhum cliente encontrado.</p>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const latestSession = lead.sessions[0];
            const prefs = (latestSession?.preferences ?? {}) as Record<string, string>;
            const imageCount = latestSession?.generatedImages?.length ?? 0;
            const videoCount = latestSession?.generatedVideos?.length ?? 0;
            const approvedImages = latestSession?.generatedImages?.filter((i) => i.isApproved).length ?? 0;
            const approvedVideos = latestSession?.generatedVideos?.filter((v) => v.isApproved).length ?? 0;
            const totalContent = imageCount + videoCount;
            const totalApproved = approvedImages + approvedVideos;
            const statusInfo = STATUS_LABELS[lead.status] ?? { label: lead.status, color: 'var(--muted-foreground)' };

            return (
              <Link
                key={lead.id}
                href={`/clients/${lead.id}`}
                className="block border border-[var(--border)] rounded-lg p-4 hover:bg-[var(--muted)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                    >
                      {(lead.name ?? lead.phone).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{lead.name ?? lead.phone}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {lead.phone} · {prefs.characterName ?? prefs.messageType ?? prefs.occasion ?? '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    {totalContent > 0 && (
                      <span className="text-[var(--muted-foreground)]">
                        {totalApproved}/{totalContent} {videoCount > 0 ? 'vídeos' : 'fotos'}
                      </span>
                    )}
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: statusInfo.color, color: 'white' }}
                    >
                      {statusInfo.label}
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Image preview strip */}
                {imageCount > 0 && latestSession.generatedImages.length > 0 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto">
                    {latestSession.generatedImages.slice(0, 6).map((img) => (
                      <div
                        key={img.id}
                        className="w-14 h-14 rounded-md overflow-hidden flex-shrink-0 relative"
                        style={{
                          border: img.isApproved ? '2px solid var(--success)' : '2px solid transparent',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.thumbnailUrl ?? img.url}
                          alt={`Foto ${img.sequence}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {imageCount > 6 && (
                      <div
                        className="w-14 h-14 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-medium"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                      >
                        +{imageCount - 6}
                      </div>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/?page=${page - 1}${status ? `&status=${status}` : ''}`}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'var(--muted)' }}
            >
              ← Anterior
            </Link>
          )}
          <span className="text-sm text-[var(--muted-foreground)]">
            Página {page} de {pagination.pages} ({pagination.total} clientes)
          </span>
          {page < pagination.pages && (
            <Link
              href={`/?page=${page + 1}${status ? `&status=${status}` : ''}`}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'var(--muted)' }}
            >
              Próxima →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
