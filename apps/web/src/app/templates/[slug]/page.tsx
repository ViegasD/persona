import Link from 'next/link';
import { fetchTemplates } from '@/lib/templates-api';
import { TemplateGrid } from './template-grid';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OccasionTemplatesPage({ params }: Props) {
  const { slug } = await params;

  let data;
  try {
    data = await fetchTemplates(slug);
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar templates</p>
        <p className="text-[var(--muted-foreground)] mt-2">Ocasião &quot;{slug}&quot; não encontrada ou backend offline.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{data.occasion.label}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {data.templates.length} template{data.templates.length !== 1 ? 's' : ''} — /{data.occasion.slug}
          </p>
        </div>
        <Link href="/templates" className="text-sm text-[var(--primary)] hover:underline">
          ← Voltar
        </Link>
      </div>

      <TemplateGrid slug={slug} initial={data.templates} occasionLabel={data.occasion.label} />
    </div>
  );
}
