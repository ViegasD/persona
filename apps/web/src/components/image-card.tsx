'use client';

import type { AdminImage } from '@/lib/api';

interface ImageCardProps {
  image: AdminImage;
  regenerating: boolean;
  onRegenerate: () => void;
  onView: () => void;
}

export function ImageCard({ image, regenerating, onRegenerate, onView }: ImageCardProps) {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-[var(--border)]">
      {/* Image */}
      <div className="aspect-[3/4] relative cursor-pointer" onClick={onView}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.thumbnailUrl ?? image.url}
          alt={`Foto ${image.sequence}`}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Approval badge */}
      {image.isApproved && (
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'var(--success)', color: 'white' }}
        >
          ✓ Aprovada
        </div>
      )}

      {/* Sequence number */}
      <div
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'rgba(0,0,0,0.5)', color: 'white' }}
      >
        {image.sequence}
      </div>

      {/* Regenerate button — visible on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRegenerate();
        }}
        disabled={regenerating}
        className="absolute bottom-2 right-2 px-2 py-1 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        title="Regenerar esta imagem"
      >
        {regenerating ? '...' : '↻ Regenerar'}
      </button>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
    </div>
  );
}
