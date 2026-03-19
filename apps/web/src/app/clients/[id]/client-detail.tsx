'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminLead, AdminSession, AdminImage } from '@/lib/api';
import { approveAllImages, regenerateImage } from '@/lib/api';
import { ImageCard } from '@/components/image-card';
import { Lightbox } from '@/components/lightbox';
import Link from 'next/link';

const STATE_LABELS: Record<string, string> = {
  ENGAGING: 'Engajando',
  COLLECTING_PHOTOS: 'Coletando fotos',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  GENERATING: 'Gerando imagens',
  GALLERY_SENT: 'Galeria enviada',
  APPROVING: 'Aprovando',
  DELIVERING: 'Entregando',
  DELIVERED: 'Entregue',
  CHURNED: 'Perdido',
};

export function ClientDetail({ lead }: { lead: AdminLead }) {
  const router = useRouter();
  const [approving, setApproving] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: AdminImage[]; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApproveAll = useCallback(
    async (sessionId: string) => {
      setApproving(sessionId);
      setError(null);
      try {
        const result = await approveAllImages(sessionId);
        if (!result.success) {
          setError(result.message);
        } else {
          router.refresh();
        }
      } catch {
        setError('Erro ao aprovar imagens.');
      } finally {
        setApproving(null);
      }
    },
    [router],
  );

  const handleRegenerate = useCallback(
    async (imageId: string) => {
      setRegenerating(imageId);
      setError(null);
      try {
        const result = await regenerateImage(imageId);
        if (result.success) {
          router.refresh();
        }
      } catch {
        setError('Erro ao regenerar imagem.');
      } finally {
        setRegenerating(null);
      }
    },
    [router],
  );

  const openLightbox = useCallback((images: AdminImage[], index: number) => {
    setLightbox({ images, index });
  }, []);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline mb-4"
      >
        ← Voltar para lista
      </Link>

      {/* Client header */}
      <div className="border border-[var(--border)] rounded-lg p-5 mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {(lead.name ?? lead.phone).charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{lead.name ?? 'Sem nome'}</h2>
            <p className="text-[var(--muted-foreground)]">{lead.phone}</p>
          </div>
        </div>
        <div className="flex gap-6 mt-4 text-sm">
          <div>
            <span className="text-[var(--muted-foreground)]">Status: </span>
            <span className="font-medium">{lead.status}</span>
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Desde: </span>
            <span>{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Sessões: </span>
            <span>{lead.sessions.length}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      {/* Sessions */}
      {lead.sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          approving={approving === session.id}
          regenerating={regenerating}
          onApproveAll={() => handleApproveAll(session.id)}
          onRegenerate={handleRegenerate}
          onViewImage={(index) => openLightbox(session.generatedImages, index)}
        />
      ))}

      {lead.sessions.length === 0 && (
        <p className="text-center text-[var(--muted-foreground)] py-12">
          Nenhuma sessão encontrada para este cliente.
        </p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((prev) => prev ? { ...prev, index } : null)}
        />
      )}
    </div>
  );
}

function SessionCard({
  session,
  approving,
  regenerating,
  onApproveAll,
  onRegenerate,
  onViewImage,
}: {
  session: AdminSession;
  approving: boolean;
  regenerating: string | null;
  onApproveAll: () => void;
  onRegenerate: (imageId: string) => void;
  onViewImage: (index: number) => void;
}) {
  const prefs = session.preferences as Record<string, string>;
  const hasImages = session.generatedImages.length > 0;
  const allApproved = hasImages && session.generatedImages.every((i) => i.isApproved);
  const canApprove =
    hasImages &&
    !allApproved &&
    ['GALLERY_SENT', 'GENERATING', 'PAID'].includes(session.funnelState);

  return (
    <div className="border border-[var(--border)] rounded-lg p-5 mb-4">
      {/* Session header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Sessão</h3>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: allApproved ? 'var(--success)' : 'var(--muted)',
                color: allApproved ? 'white' : 'var(--foreground)',
              }}
            >
              {STATE_LABELS[session.funnelState] ?? session.funnelState}
            </span>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {prefs.occasion && `Ocasião: ${prefs.occasion}`}
            {prefs.packageId && ` · Pacote: ${prefs.packageId}`}
            {` · ${new Date(session.createdAt).toLocaleDateString('pt-BR')}`}
          </p>
        </div>

        {canApprove && (
          <button
            onClick={onApproveAll}
            disabled={approving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--success)', color: 'white' }}
          >
            {approving ? 'Aprovando...' : `✓ Aprovar todas (${session.generatedImages.length})`}
          </button>
        )}

        {allApproved && (
          <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
            ✅ Todas aprovadas
          </span>
        )}
      </div>

      {/* Image grid */}
      {hasImages ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {session.generatedImages.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              regenerating={regenerating === image.id}
              onRegenerate={() => onRegenerate(image.id)}
              onView={() => onViewImage(index)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
          Nenhuma imagem gerada nesta sessão.
        </p>
      )}
    </div>
  );
}
