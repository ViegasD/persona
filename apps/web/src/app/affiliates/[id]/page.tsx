import Link from 'next/link';
import { fetchAffiliates, fetchAffiliateOrders } from '@/lib/storefront-api';
import { AffiliateDetailClient } from './affiliate-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AffiliateDetailPage({ params }: Props) {
  const { id } = await params;
  const affiliateId = Number(id);

  let affiliate;
  let orders;
  try {
    const affiliates = await fetchAffiliates();
    affiliate = affiliates.find((a) => a.id === affiliateId);
    if (!affiliate) {
      return (
        <div className="text-center py-20">
          <p className="text-[var(--error)] text-lg font-medium">Afiliado não encontrado</p>
          <Link href="/affiliates" className="text-sm text-[var(--primary)] hover:underline mt-2 inline-block">
            ← Voltar
          </Link>
        </div>
      );
    }
    orders = await fetchAffiliateOrders(affiliateId);
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar dados do afiliado</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/affiliates" className="text-sm text-[var(--muted-foreground)] hover:underline">
          ← Afiliados
        </Link>
      </div>
      <AffiliateDetailClient affiliate={affiliate} orders={orders} />
    </div>
  );
}
