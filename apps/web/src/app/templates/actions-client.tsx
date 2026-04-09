'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { seedOccasionsAction, syncTemplatesAction } from '@/lib/template-actions';

export function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const result = await seedOccasionsAction();
          alert(`Seed: ${result.created} ocasiões criadas (${result.total} total)`);
          router.refresh();
        } catch (err) {
          alert(`Erro: ${err}`);
        } finally {
          setLoading(false);
        }
      }}
      className="px-3 py-1.5 text-sm rounded-lg transition-colors"
      style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
    >
      {loading ? 'Criando...' : '🌱 Seed Ocasiões'}
    </button>
  );
}

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const result = await syncTemplatesAction();
          alert(`Sync: ${result.synced} templates sincronizados do MinIO`);
          router.refresh();
        } catch (err) {
          alert(`Erro: ${err}`);
        } finally {
          setLoading(false);
        }
      }}
      className="px-3 py-1.5 text-sm rounded-lg transition-colors"
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
    >
      {loading ? 'Sincronizando...' : '🔄 Sync MinIO'}
    </button>
  );
}
