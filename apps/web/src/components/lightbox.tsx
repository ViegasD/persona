'use client';

import { useCallback, useEffect } from 'react';
import type { AdminImage } from '@/lib/api';

interface LightboxProps {
  images: AdminImage[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ images, currentIndex, onClose, onNavigate }: LightboxProps) {
  const image = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
    },
    [onClose, onNavigate, currentIndex, hasPrev, hasNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-3xl z-10 w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Fechar"
      >
        ✕
      </button>

      {/* Prev */}
      {hasPrev && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-4 text-white text-4xl z-10 w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10"
          aria-label="Anterior"
        >
          ‹
        </button>
      )}

      {/* Image */}
      <div className="relative w-full h-full max-w-4xl max-h-[85vh] mx-16 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={`Foto ${image.sequence}`}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Next */}
      {hasNext && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-4 text-white text-4xl z-10 w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10"
          aria-label="Próxima"
        >
          ›
        </button>
      )}

      {/* Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-4 py-2 rounded-full">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}
