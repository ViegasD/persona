import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vídeo Personalizado — Admin',
  description: 'Painel administrativo para aprovação de vídeos personalizados.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)] px-6 py-3 flex items-center gap-6">
          <h1 className="text-lg font-bold">🎬 Vídeo Personalizado — Admin</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="hover:underline">Clientes</Link>
            <Link href="/orders" className="hover:underline">Pedidos</Link>
            <Link href="/finance" className="hover:underline">Financeiro</Link>
            <Link href="/approvals" className="hover:underline">Aprovações</Link>
            <Link href="/characters" className="hover:underline">Personagens</Link>
            <Link href="/templates" className="hover:underline">Templates</Link>
            <Link href="/settings" className="hover:underline">Configurações</Link>
          </nav>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
