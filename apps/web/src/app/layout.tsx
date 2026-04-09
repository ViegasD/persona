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
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)] px-6 py-3 flex items-center gap-6">
          <h1 className="text-lg font-bold">📸 Ensaio Digital — Admin</h1>
          <nav className="flex gap-4 text-sm">
            <a href="/" className="hover:underline">Clientes</a>
            <a href="/templates" className="hover:underline">Templates</a>
          </nav>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
