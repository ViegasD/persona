'use client';

import { useCallback, useEffect, useRef } from 'react';

interface VideoLightboxProps {
  videos: Array<{
    id: string;
    url: string;
    sequence: number;
    durationSeconds: number | null;
  }>;
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function VideoLightbox({ videos, currentIndex, onClose, onNavigate }: VideoLightboxProps) {
  const video = videos[currentIndex];
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < videos.length - 1;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
      if (e.key === ' ') {
        e.preventDefault();
        const v = videoRef.current;
        if (v) v.paused ? v.play() : v.pause();
      }
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

      {/* Video player */}
      <div className="relative w-full h-full max-w-3xl max-h-[85vh] mx-16 flex items-center justify-center">
        <video
          ref={videoRef}
          key={video.id}
          src={video.url}
          className="max-w-full max-h-full"
          controls
          autoPlay
          playsInline
        />
      </div>

      {/* Next */}
      {hasNext && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-4 text-white text-4xl z-10 w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10"
          aria-label="Próximo"
        >
          ›
        </button>
      )}

      {/* Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-4 py-2 rounded-full">
        {currentIndex + 1} / {videos.length}
      </div>
    </div>
  );
}
