import { fetchSettings } from '@/lib/settings-api';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar configurações</p>
        <p className="text-[var(--muted-foreground)] mt-2">Verifique se o backend está rodando.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Configurações</h2>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Ajustes do comportamento do bot em tempo real.
        </p>
      </div>
      <div className="max-w-xl">
        <SettingsForm initialSettings={settings} />
      </div>
    </div>
  );
}
