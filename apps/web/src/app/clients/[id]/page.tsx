import { fetchLead } from '@/lib/api';
import { ClientDetail } from './client-detail';

interface ClientPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { id } = await params;

  try {
    const lead = await fetchLead(id);
    return <ClientDetail lead={lead} />;
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar cliente</p>
        <p className="text-[var(--muted-foreground)] mt-2">
          O cliente pode não existir ou o backend está indisponível.
        </p>
      </div>
    );
  }
}
