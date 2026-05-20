import Link from 'next/link';
import { fetchAffiliates } from '@/lib/storefront-api';
import { AffiliatesClient } from './affiliates-client';

export default async function AffiliatesPage() {
  let affiliates;
  try {
    affiliates = await fetchAffiliates();
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar afiliados</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Afiliados</h2>
        <span className="text-sm text-[var(--muted-foreground)]">{affiliates.length} total</span>
      </div>
      <AffiliatesClient affiliates={affiliates} />
    </div>
  );
}
