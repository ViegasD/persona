'use client';

import { useState, useRef } from 'react';
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editTags, setEditTags] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  /* ── Upload (one at a time) ────────────────────────── */
  async function handleUpload(files: FileList) {
    setUploading(true);
    const fileArray = Array.from(files);
    let uploaded = 0;
    try {
      for (const file of fileArray) {
        setUploadProgress(`${++uploaded}/${fileArray.length} — ${file.name}`);
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        const result = await uploadTemplatesAction(slug, [
          { base64, filename: file.name, mimeType: file.type },
        ]);
        setTemplates((prev) => [...result.templates, ...prev]);
      }
    } catch (err) {
      alert(`Erro no upload (${uploaded}/${fileArray.length}): ${err}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /* ── Edit ───────────────────────────────────────────── */
  function openEdit(t: AdminTemplate) {
    setEditingId(t.id);
    setEditPrompt(t.scenePrompt);
    setEditTags(t.tags.join(', '));
  }

  async function saveEdit() {
    if (!editingId) return;
    const id = editingId;
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

  /* ── Delete ─────────────────────────────────────────── */
  async function handleDelete(id: string) {
    if (!confirm('Remover este template?')) return;
    try {
      await deleteTemplateAction(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(`Erro: ${err}`);
    }
  }

  /* ── Regenerate ─────────────────────────────────────── */
  async function handleRegenerate(id: string) {
    setBusyId(id);
    try {
      const updated = await regeneratePromptAction(id);
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, scenePrompt: updated.scenePrompt, tags: updated.tags } : t)),
      );
    } catch (err) {
      alert(`Erro: ${err}`);
    } finally {
      setBusyId(null);
    }
  }

  /* ── Image error fallback ───────────────────────────── */
  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.img-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'img-fallback absolute inset-0 flex items-center justify-center text-4xl opacity-30';
      fallback.textContent = '📷';
      parent.appendChild(fallback);
    }
  }

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div>
      {/* Upload bar */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-6 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)] transition-all text-sm disabled:opacity-60"
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
          <span className="text-[var(--muted-foreground)]">⏳ {uploadProgress}</span>
        ) : (
          <>
            <span>📸</span>
            <span>Enviar imagens de template</span>
            <span className="text-[var(--muted-foreground)]">— GPT-4o gera o prompt automaticamente</span>
          </>
        )}
      </button>

      {/* Empty state */}
      {templates.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <p className="text-4xl mb-3">📷</p>
          <p>Nenhum template para &quot;{occasionLabel}&quot;</p>
          <p className="text-sm mt-1">Envie imagens acima para começar.</p>
        </div>
      ) : (
        /* Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="group relative rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background)]"
            >
              {/* Image */}
              <div className="aspect-[3/4] relative bg-[var(--muted)]">
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.imageUrl}
                    alt=""
                    loading="lazy"
                    onError={handleImgError}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-30">📷</div>
                )}

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end justify-center gap-1.5 p-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(t)}
                    className="p-1.5 rounded-md bg-white/90 hover:bg-white text-black text-xs"
                    title="Editar prompt"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleRegenerate(t.id)}
                    disabled={busyId === t.id}
                    className="p-1.5 rounded-md bg-white/90 hover:bg-white text-black text-xs disabled:opacity-50"
                    title="Regenerar prompt com GPT-4o"
                  >
                    {busyId === t.id ? '⏳' : '🔄'}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded-md bg-red-500/90 hover:bg-red-500 text-white text-xs"
                    title="Remover"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-xs leading-snug line-clamp-2 text-[var(--foreground)]">
                  {t.scenePrompt}
                </p>
                {t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--muted)] text-[var(--muted-foreground)]"
                      >
                        {tag}
                      </span>
                    ))}
                    {t.tags.length > 4 && (
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        +{t.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setEditingId(null)}
        >
          <div className="bg-[var(--background)] rounded-xl border border-[var(--border)] w-full max-w-lg p-5 shadow-xl">
            <h3 className="text-sm font-semibold mb-3">Editar prompt do template</h3>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={5}
              className="w-full p-2.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--background)] resize-y focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            <label className="block text-xs text-[var(--muted-foreground)] mt-3 mb-1">Tags (separadas por vírgula)</label>
            <input
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              className="w-full p-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                className="px-3 py-1.5 text-sm rounded-lg text-white transition-colors"
                style={{ background: 'var(--primary)' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
