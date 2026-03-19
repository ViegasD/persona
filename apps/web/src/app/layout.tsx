import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ensaio Digital — Admin',
  description: 'Painel administrativo para aprovação de imagens geradas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)] px-6 py-3">
          <h1 className="text-lg font-bold">📸 Ensaio Digital — Admin</h1>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
