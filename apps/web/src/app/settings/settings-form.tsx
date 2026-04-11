'use client';

import { useState, useTransition } from 'react';

interface SettingsFormProps {
  initialSettings: Record<string, string>;
}

const RANGE_LABELS: Record<string, { label: string; description: string; unit: string; min: number; max: number }> = {
  message_debounce_ms: {
    label: 'Tempo de espera da resposta',
    description: 'Quanto tempo a Bia espera depois da última mensagem antes de responder. Permite que o cliente envie várias mensagens seguidas.',
    unit: 'ms',
    min: 2000,
    max: 60000,
  },
};

const TEXT_LABELS: Record<string, { label: string; description: string; placeholder: string }> = {
  portfolio_url: {
    label: 'URL do Portfólio',
    description: 'Link do Instagram ou site com trabalhos anteriores. O agente envia quando o cliente pergunta se é confiável.',
    placeholder: 'https://www.instagram.com/ensaio.digital.ia',
  },
  payment_account_name: {
    label: 'Nome da Conta para Pagamento',
    description: 'Nome que aparece na mensagem do Pix como destinatário. Transmite credibilidade ao cliente.',
    placeholder: 'Ensaio Digital LTDA',
  },
};

const TEXTAREA_LABELS: Record<string, { label: string; description: string; placeholder: string; rows: number }> = {
  agent_identity: {
    label: 'Identidade do Agente',
    description: 'Prompt que define a personalidade, nome e tom de voz do agente. Será injetado no início de cada conversa.',
    placeholder: 'Você é a *Bia*, atendente do *Ensaio Digital*. Amigável, competente, entusiasmada. Português brasileiro natural e acessível.',
    rows: 4,
  },
};

const OPENAI_MODELS = ['gpt-5-mini', 'gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1'];

const AGENT_MODEL_LABELS: Record<string, { label: string; description: string }> = {
  model_agent_extraction:   { label: 'Extração',  description: 'Extrai dados estruturados das mensagens do cliente (nome, pacote, ocasião, etc.)' },
  model_agent_conversation: { label: 'Conversa',  description: 'Gera as respostas do agente em todas as fases do funil' },
};

const GENERATION_RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K — Rápido, menor custo' },
  { value: '2K', label: '2K — Balanceado (padrão)' },
  { value: '4K', label: '4K — Máxima qualidade' },
];

const UPSCALE_PROVIDER_OPTIONS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'topaz', label: 'Topaz — Upscale realista (ajustável)' },
  { value: 'crisp', label: 'Recraft Crisp — Upscale nítido' },
];

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [values, setValues] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch('/manager/api/settings', {
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
      {Object.entries(RANGE_LABELS).map(([key, meta]) => {
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

      {Object.entries(TEXT_LABELS).map(([key, meta]) => (
        <div key={key} className="border border-[var(--border)] rounded-lg p-5">
          <label className="block text-sm font-medium mb-1">{meta.label}</label>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">{meta.description}</p>
          <input
            type="text"
            value={values[key] ?? ''}
            placeholder={meta.placeholder}
            onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
          />
        </div>
      ))}

      {Object.entries(TEXTAREA_LABELS).map(([key, meta]) => (
        <div key={key} className="border border-[var(--border)] rounded-lg p-5">
          <label className="block text-sm font-medium mb-1">{meta.label}</label>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">{meta.description}</p>
          <textarea
            value={values[key] ?? ''}
            placeholder={meta.placeholder}
            rows={meta.rows}
            onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm resize-y"
          />
        </div>
      ))}

      <div>
        <h2 className="text-base font-semibold mb-3">Modelos por Agente</h2>
        <div className="space-y-3">
          {Object.entries(AGENT_MODEL_LABELS).map(([key, meta]) => (
            <div key={key} className="border border-[var(--border)] rounded-lg p-5">
              <label className="block text-sm font-medium mb-1">{meta.label}</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-3">{meta.description}</p>
              <select
                value={values[key] ?? OPENAI_MODELS[0]}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              >
                {OPENAI_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Geração de Imagens</h2>
        <div className="space-y-3">
          <div className="border border-[var(--border)] rounded-lg p-5">
            <label className="block text-sm font-medium mb-1">Resolução da Geração</label>
            <p className="text-xs text-[var(--muted-foreground)] mb-3">
              Resolução das imagens geradas pelo Nano Banana 2. Maior resolução = mais qualidade e custo.
            </p>
            <select
              value={values['generation_resolution'] ?? '2K'}
              onChange={(e) => setValues((prev) => ({ ...prev, generation_resolution: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
            >
              {GENERATION_RESOLUTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="border border-[var(--border)] rounded-lg p-5">
            <label className="block text-sm font-medium mb-1">Upscale Pós-Geração</label>
            <p className="text-xs text-[var(--muted-foreground)] mb-3">
              Opcionalmente, aplica upscale em cada imagem gerada antes de enviar ao cliente. Aumenta o tempo de processamento.
            </p>
            <select
              value={values['upscale_provider'] ?? 'none'}
              onChange={(e) => setValues((prev) => ({ ...prev, upscale_provider: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
            >
              {UPSCALE_PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

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
