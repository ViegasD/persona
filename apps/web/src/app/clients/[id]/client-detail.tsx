'use client';

import { useState, useCallback } from 'react';

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
import { useRouter } from 'next/navigation';
import type { AdminLead, AdminSession, AdminImage, AdminVideo } from '@/lib/api';
import { approveAllAction, regenerateAction, generateSessionAction } from '@/lib/actions';
import { ImageCard } from '@/components/image-card';
import { VideoCard } from '@/components/video-card';
import { Lightbox } from '@/components/lightbox';
import { VideoLightbox } from '@/components/video-lightbox';
import Link from 'next/link';

const STATE_LABELS: Record<string, string> = {
  CONVERSATION: 'Em conversa',
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
  const [generating, setGenerating] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: AdminImage[]; index: number } | null>(null);
  const [videoLightbox, setVideoLightbox] = useState<{ videos: AdminVideo[]; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApproveAll = useCallback(
    async (sessionId: string) => {
      setApproving(sessionId);
      setError(null);
      try {
        const result = await approveAllAction(sessionId);
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
        const result = await regenerateAction(imageId);
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

  const handleGenerate = useCallback(
    async (sessionId: string) => {
      setGenerating(sessionId);
      setError(null);
      try {
        const result = await generateSessionAction(sessionId);
        if (!result.success) {
          setError('Erro ao disparar geração.');
        } else {
          router.refresh();
        }
      } catch {
        setError('Erro ao disparar geração.');
      } finally {
        setGenerating(null);
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
          <Link
            href={`/clients/${lead.id}/chat`}
            className="ml-auto px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            💬 Chat
          </Link>
        </div>
        <div className="flex gap-6 mt-4 text-sm">
          <div>
            <span className="text-[var(--muted-foreground)]">Status: </span>
            <span className="font-medium">{lead.status}</span>
          </div>
          <div>
            <span className="text-[var(--muted-foreground)]">Desde: </span>
            <span>{fmtDate(lead.createdAt)}</span>
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
          generating={generating === session.id}
          onApproveAll={() => handleApproveAll(session.id)}
          onRegenerate={handleRegenerate}
          onGenerate={() => handleGenerate(session.id)}
          onViewImage={(index) => openLightbox(session.generatedImages, index)}
          onViewVideo={(index) => setVideoLightbox({ videos: session.generatedVideos ?? [], index })}
          onViewRefImage={(index) => {
            const refAsAdmin = session.referenceImages.map((r, i) => ({
              id: r.id, url: r.url, thumbnailUrl: null, sequence: i + 1, isApproved: false,
            }));
            openLightbox(refAsAdmin, index);
          }}
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
      {videoLightbox && (
        <VideoLightbox
          videos={videoLightbox.videos}
          currentIndex={videoLightbox.index}
          onClose={() => setVideoLightbox(null)}
          onNavigate={(index) => setVideoLightbox((prev) => prev ? { ...prev, index } : null)}
        />
      )}
    </div>
  );
}

function SessionCard({
  session,
  approving,
  regenerating,
  generating,
  onApproveAll,
  onRegenerate,
  onGenerate,
  onViewImage,
  onViewVideo,
  onViewRefImage,
}: {
  session: AdminSession;
  approving: boolean;
  regenerating: string | null;
  generating: boolean;
  onApproveAll: () => void;
  onRegenerate: (imageId: string) => void;
  onGenerate: () => void;
  onViewImage: (index: number) => void;
  onViewVideo: (index: number) => void;
  onViewRefImage: (index: number) => void;
}) {
  const prefs = session.preferences as Record<string, string>;
  const meta = (session.metadata ?? {}) as Record<string, number>;
  const expectedPhotos = meta.expectedPhotos ?? 0;
  const failedPhotos = meta.failedPhotos ?? 0;
  const hasImages = session.generatedImages.length > 0;
  const hasVideos = (session.generatedVideos ?? []).length > 0;
  const hasContent = hasImages || hasVideos;
  const allImagesApproved = hasImages && session.generatedImages.every((i) => i.isApproved);
  const allVideosApproved = hasVideos && (session.generatedVideos ?? []).every((v) => v.isApproved);
  const allApproved = hasContent && (!hasImages || allImagesApproved) && (!hasVideos || allVideosApproved);
  const canApprove =
    hasContent &&
    !allApproved &&
    ['GALLERY_SENT', 'GENERATING', 'PAID', 'APPROVING'].includes(session.funnelState);
  const canGenerate = !hasContent && session.funnelState === 'PAID';
  const totalContent = session.generatedImages.length + (session.generatedVideos ?? []).length;

  return (
    <div className="border border-[var(--border)] rounded-lg p-5 mb-4">
      {/* Partial generation warning */}
      {failedPhotos > 0 && (
        <div
          className="mb-4 p-3 rounded-lg text-sm flex items-center justify-between"
          style={{ background: 'var(--warning)', color: '#000' }}
        >
          <span>
            ⚠ {session.generatedImages.length} de {expectedPhotos} fotos geradas — {failedPhotos} falharam no Kie.ai
          </span>
        </div>
      )}

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
            {prefs.characterName && `Personagem: ${prefs.characterName}`}
            {prefs.messageType && ` · Tipo: ${prefs.messageType}`}
            {prefs.recipientName && ` · Para: ${prefs.recipientName}`}
            {!prefs.characterName && prefs.occasion && `Ocasião: ${prefs.occasion}`}
            {prefs.packageId && ` · Pacote: ${prefs.packageId}`}
            {` · ${fmtDate(session.createdAt)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canGenerate && (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {generating ? 'Disparando...' : '▶ Gerar conteúdo'}
            </button>
          )}

          {canApprove && (
            <button
              onClick={onApproveAll}
              disabled={approving}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--success)', color: 'white' }}
            >
              {approving ? 'Aprovando...' : `✓ Aprovar tudo (${totalContent})`}
            </button>
          )}
        </div>

        {allApproved && (
          <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
            ✅ Todas aprovadas
          </span>
        )}
      </div>

      {/* Reference photos (user selfies) */}
      {session.referenceImages.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
            Fotos enviadas pelo cliente
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {session.referenceImages.map((img, index) => (
              <div
                key={img.id}
                className="relative group rounded-lg overflow-hidden border border-[var(--border)] cursor-pointer"
                onClick={() => onViewRefImage(index)}
              >
                <div className="aspect-[3/4] relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated image grid */}
      {hasImages && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
            Imagens geradas
          </h4>
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
        </div>
      )}

      {/* Generated video grid */}
      {hasVideos && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
            Vídeos gerados
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(session.generatedVideos ?? []).map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                onView={() => onViewVideo(index)}
              />
            ))}
          </div>
        </div>
      )}

      {!hasContent && (
        <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
          Nenhum conteúdo gerado nesta sessão.
        </p>
      )}
    </div>
  );
}
