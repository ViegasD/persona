'use client';

interface VideoCardProps {
  video: {
    id: string;
    url: string;
    sequence: number;
    isApproved: boolean;
    durationSeconds: number | null;
  };
  onView: () => void;
}

export function VideoCard({ video, onView }: VideoCardProps) {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-[var(--border)]">
      {/* Video */}
      <div className="aspect-[9/16] relative cursor-pointer bg-black" onClick={onView}>
        <video
          src={video.url}
          className="w-full h-full object-contain"
          muted
          preload="metadata"
          playsInline
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            <span className="text-white text-xl ml-1">▶</span>
          </div>
        </div>
      </div>

      {/* Approval badge */}
      {video.isApproved && (
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'var(--success)', color: 'white' }}
        >
          ✓ Aprovado
        </div>
      )}

      {/* Sequence number */}
      <div
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'rgba(0,0,0,0.5)', color: 'white' }}
      >
        {video.sequence}
      </div>

      {/* Duration */}
      {video.durationSeconds && (
        <div
          className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-xs font-medium"
          style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
        >
          {video.durationSeconds}s
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
    </div>
  );
}
