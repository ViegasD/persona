import Link from 'next/link';
import { fetchOccasions } from '@/lib/templates-api';
import { SeedButton, SyncButton } from './actions-client';

export default async function TemplatesPage() {
  let occasions;
  try {
    occasions = await fetchOccasions();
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar ocasiões</p>
        <p className="text-[var(--muted-foreground)] mt-2">Verifique se o backend está rodando.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Templates de Estilo</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Gerencie as fotos de referência e seus prompts de cena por ocasião.
          </p>
        </div>
        <div className="flex gap-2">
          <SeedButton />
          <SyncButton />
        </div>
      </div>

      {occasions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--muted-foreground)]">Nenhuma ocasião cadastrada.</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Clique em &quot;Seed Ocasiões&quot; para criar as padrão.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {occasions.map((occ) => (
            <Link
              key={occ.id}
              href={`/templates/${occ.slug}`}
              className="block border border-[var(--border)] rounded-lg p-5 hover:bg-[var(--muted)] transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-lg">{occ.label}</h3>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: occ.templateCount > 0 ? 'var(--success)' : 'var(--warning)',
                    color: 'white',
                  }}
                >
                  {occ.templateCount} {occ.templateCount === 1 ? 'template' : 'templates'}
                </span>
              </div>
              <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">{occ.promptHint}</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-2">/{occ.slug}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link href="/" className="text-sm text-[var(--primary)] hover:underline">
          ← Voltar para Clientes
        </Link>
      </div>
    </div>
  );
}
