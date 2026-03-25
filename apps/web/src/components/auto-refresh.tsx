'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ interval = 30_000 }: { interval?: number }) {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setLastUpdated(fmt());

    const id = setInterval(() => {
      router.refresh();
      setLastUpdated(fmt());
    }, interval);

    return () => clearInterval(id);
  }, [router, interval]);

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
      {lastUpdated && <span>Atualizado às {lastUpdated}</span>}
      <button
        onClick={() => {
          router.refresh();
          setLastUpdated(
            new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          );
        }}
        className="px-2 py-1 rounded hover:bg-[var(--muted)] transition-colors"
      >
        ↻ Atualizar
      </button>
    </div>
  );
}
