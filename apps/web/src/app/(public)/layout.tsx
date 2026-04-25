import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Meus Vídeos',
  description: 'Acesse os seus vídeos personalizados.',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-2xl px-4 py-10">{children}</div>
      </body>
    </html>
  );
}
