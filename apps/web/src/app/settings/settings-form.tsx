'use client';

import { useState, useTransition } from 'react';

interface SettingsFormProps {
  initialSettings: Record<string, string>;
}

const LABELS: Record<string, { label: string; description: string; unit: string; min: number; max: number }> = {
  message_debounce_ms: {
    label: 'Tempo de espera da resposta',
    description: 'Quanto tempo a Bia espera depois da última mensagem antes de responder. Permite que o cliente envie várias mensagens seguidas.',
    unit: 'ms',
    min: 2000,
    max: 60000,
  },
};

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [values, setValues] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar');
        setMessage({ type: 'success', text: 'Configurações salvas!' });
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Erro desconhecido' });
      }
    });
  };

  return (
    <div className="space-y-6">
      {Object.entries(LABELS).map(([key, meta]) => {
        const raw = values[key] ?? '';
        const numValue = Number(raw);
        const seconds = numValue / 1000;

        return (
          <div key={key} className="border border-[var(--border)] rounded-lg p-5">
            <label className="block text-sm font-medium mb-1">{meta.label}</label>
            <p className="text-xs text-[var(--muted-foreground)] mb-3">{meta.description}</p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={meta.min}
                max={meta.max}
                step={1000}
                value={raw}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                className="flex-1"
              />
              <span className="text-sm font-mono w-16 text-right">{seconds}s</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-1">
              <span>{meta.min / 1000}s</span>
              <span>{meta.max / 1000}s</span>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
        {message && (
          <span className={`text-sm ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
