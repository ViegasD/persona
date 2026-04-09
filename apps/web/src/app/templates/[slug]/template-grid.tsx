'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminTemplate } from '@/lib/templates-api';
import {
  uploadTemplatesAction,
  updateTemplateAction,
  deleteTemplateAction,
  regeneratePromptAction,
} from '@/lib/template-actions';

interface Props {
  slug: string;
  initial: AdminTemplate[];
  occasionLabel: string;
}

export function TemplateGrid({ slug, initial, occasionLabel }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editTags, setEditTags] = useState('');

  async function handleUpload(files: FileList) {
    setUploading(true);
    try {
      const images: Array<{ base64: string; filename: string; mimeType: string }> = [];
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        images.push({ base64, filename: file.name, mimeType: file.type });
      }

      const result = await uploadTemplatesAction(slug, images);
      setTemplates((prev) => [...result.templates, ...prev]);
      alert(`${result.created} template(s) criado(s) com análise de cena via GPT-4o`);
    } catch (err) {
      alert(`Erro no upload: ${err}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function startEdit(t: AdminTemplate) {
    setEditingId(t.id);
    setEditPrompt(t.scenePrompt);
    setEditTags(t.tags.join(', '));
  }

  async function saveEdit(id: string) {
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      await updateTemplateAction(id, { scenePrompt: editPrompt, tags });
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, scenePrompt: editPrompt, tags } : t)),
      );
      setEditingId(null);
    } catch (err) {
      alert(`Erro: ${err}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desativar este template?')) return;
    try {
      await deleteTemplateAction(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(`Erro: ${err}`);
    }
  }

  async function handleRegenerate(id: string) {
    try {
      const updated = await regeneratePromptAction(id);
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, scenePrompt: updated.scenePrompt, tags: updated.tags } : t)),
      );
      alert('Prompt regenerado com GPT-4o');
    } catch (err) {
      alert(`Erro: ${err}`);
    }
  }

  return (
    <div>
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-[var(--border)] rounded-lg p-8 text-center mb-6 cursor-pointer hover:border-[var(--primary)] transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
        {uploading ? (
          <p className="text-[var(--muted-foreground)]">
            Enviando e analisando com GPT-4o... (pode levar alguns segundos por imagem)
          </p>
        ) : (
          <>
            <p className="text-lg font-medium">📸 Clique ou arraste para enviar templates</p>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              JPG, PNG ou WebP — máx. 10 imagens por vez. Cada uma será analisada por GPT-4o para gerar o prompt de cena.
            </p>
          </>
        )}
      </div>

      {/* Template grid */}
      {templates.length === 0 ? (
        <p className="text-center text-[var(--muted-foreground)] py-12">
          Nenhum template para &quot;{occasionLabel}&quot;. Envie imagens acima.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
              {/* Image */}
              {t.imageUrl && (
                <div className="aspect-square relative bg-[var(--muted)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.imageUrl}
                    alt={`Template ${t.id.slice(0, 8)}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Details */}
              <div className="p-4">
                {editingId === t.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={4}
                      className="w-full p-2 border border-[var(--border)] rounded text-sm bg-[var(--background)]"
                    />
                    <input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      className="w-full p-2 border border-[var(--border)] rounded text-sm bg-[var(--background)]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(t.id)}
                        className="px-3 py-1 text-sm rounded"
                        style={{ background: 'var(--success)', color: 'white' }}
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-sm rounded"
                        style={{ background: 'var(--muted)' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed mb-2">{t.scenePrompt}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {t.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-xs"
                          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(t)}
                        className="px-2 py-1 text-xs rounded"
                        style={{ background: 'var(--muted)' }}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleRegenerate(t.id)}
                        className="px-2 py-1 text-xs rounded"
                        style={{ background: 'var(--muted)' }}
                      >
                        🔄 Regenerar
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="px-2 py-1 text-xs rounded"
                        style={{ background: 'var(--error)', color: 'white' }}
                      >
                        🗑️ Remover
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
