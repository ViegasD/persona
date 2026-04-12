'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import type { AdminTemplate } from '@/lib/templates-api';
import {
  updateTemplateAction,
  deleteTemplateAction,
  regeneratePromptAction,
} from '@/lib/template-actions';
import { enqueueUploads, getQueue, clearDone, subscribe, type QueueItem } from '@/lib/upload-queue';

interface Props {
  slug: string;
  initial: AdminTemplate[];
  occasionLabel: string;
}

const EMPTY_QUEUE: QueueItem[] = [];

function useUploadQueue(slug: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getQueue(slug),
    () => EMPTY_QUEUE,
  );
  return snapshot;
}

export function TemplateGrid({ slug, initial, occasionLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editGender, setEditGender] = useState<'MALE' | 'FEMALE' | 'UNISEX'>('UNISEX');
  const [editExpression, setEditExpression] = useState<'SMILING' | 'NEUTRAL' | 'ANY'>('ANY');
  const [busyId, setBusyId] = useState<string | null>(null);

  const queueItems = useUploadQueue(slug);
  const activeUploads = queueItems.filter((q) => q.status === 'pending' || q.status === 'uploading');
  const isUploading = activeUploads.length > 0;

  // Merge completed queue items into templates list
  useEffect(() => {
    const done = queueItems.filter((q) => q.status === 'done' && q.result);
    if (done.length === 0) return;

    setTemplates((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const newTemplates = done
        .map((q) => q.result!)
        .filter((t) => !existingIds.has(t.id));
      if (newTemplates.length === 0) return prev;
      return [...newTemplates, ...prev];
    });

    clearDone(slug);
  }, [queueItems, slug]);

  /* ── Upload ────────────────────────────────────────── */
  async function handleUpload(files: FileList) {
    const fileArray = Array.from(files);

    // Read all files as base64
    const images = await Promise.all(
      fileArray.map(
        (file) =>
          new Promise<{ base64: string; filename: string; mimeType: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                base64: (reader.result as string).split(',')[1],
                filename: file.name,
                mimeType: file.type,
              });
            reader.readAsDataURL(file);
          }),
      ),
    );

    // Enqueue — processing starts immediately and survives navigation
    enqueueUploads(slug, images);

    if (fileRef.current) fileRef.current.value = '';
  }

  /* ── Edit ───────────────────────────────────────────── */
  function openEdit(t: AdminTemplate) {
    setEditingId(t.id);
    setEditPrompt(t.scenePrompt);
    setEditTags(t.tags.join(', '));
    setEditGender(t.gender);
    setEditExpression(t.expression);
  }

  async function saveEdit() {
    if (!editingId) return;
    const id = editingId;
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      await updateTemplateAction(id, { scenePrompt: editPrompt, tags, gender: editGender, expression: editExpression });
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, scenePrompt: editPrompt, tags, gender: editGender, expression: editExpression } : t)),
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
      if (!updated || !updated.scenePrompt) throw new Error('Resposta inválida do servidor');
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, scenePrompt: updated.scenePrompt, tags: updated.tags ?? t.tags, gender: updated.gender ?? t.gender, expression: updated.expression ?? t.expression } : t)),
      );
    } catch (err) {
      alert(`Erro ao regenerar: ${err instanceof Error ? err.message : err}`);
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
        disabled={isUploading}
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
        {isUploading ? (
          <span className="text-[var(--muted-foreground)]">
            ⏳ Enviando {activeUploads.length} imagem{activeUploads.length !== 1 ? 's' : ''}
            {activeUploads.find((q) => q.status === 'uploading')
              ? ` — ${activeUploads.find((q) => q.status === 'uploading')!.filename}`
              : ''}
            <span className="text-[10px] ml-2">(pode sair da página — continua enviando)</span>
          </span>
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

                {/* Regeneration loading overlay */}
                {busyId === t.id && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 z-10">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-white text-xs font-medium">Analisando com GPT-4o...</span>
                  </div>
                )}

                {/* Gender badge */}
                <span className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium backdrop-blur-sm ${
                  t.gender === 'MALE' ? 'bg-blue-500/80 text-white' :
                  t.gender === 'FEMALE' ? 'bg-pink-500/80 text-white' :
                  'bg-gray-500/60 text-white'
                }`}>
                  {t.gender === 'MALE' ? '♂' : t.gender === 'FEMALE' ? '♀' : '⚥'}
                </span>

                {/* Expression badge */}
                <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium backdrop-blur-sm ${
                  t.expression === 'SMILING' ? 'bg-yellow-500/80 text-white' :
                  t.expression === 'NEUTRAL' ? 'bg-slate-500/80 text-white' :
                  'bg-gray-500/60 text-white'
                }`}>
                  {t.expression === 'SMILING' ? '😊' : t.expression === 'NEUTRAL' ? '😐' : '—'}
                </span>

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
            <label className="block text-xs text-[var(--muted-foreground)] mt-3 mb-1">Gênero do template</label>
            <div className="flex gap-2">
              {(['MALE', 'FEMALE', 'UNISEX'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setEditGender(g)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    editGender === g
                      ? g === 'MALE' ? 'bg-blue-500 text-white border-blue-500'
                        : g === 'FEMALE' ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-gray-500 text-white border-gray-500'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {g === 'MALE' ? '♂ Masculino' : g === 'FEMALE' ? '♀ Feminino' : '⚥ Unissex'}
                </button>
              ))}
            </div>
            <label className="block text-xs text-[var(--muted-foreground)] mt-3 mb-1">Expressão do template</label>
            <div className="flex gap-2">
              {(['SMILING', 'NEUTRAL', 'ANY'] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEditExpression(e)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    editExpression === e
                      ? e === 'SMILING' ? 'bg-yellow-500 text-white border-yellow-500'
                        : e === 'NEUTRAL' ? 'bg-slate-500 text-white border-slate-500'
                        : 'bg-gray-500 text-white border-gray-500'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {e === 'SMILING' ? '😊 Sorrindo' : e === 'NEUTRAL' ? '😐 Neutro' : '— Qualquer'}
                </button>
              ))}
            </div>
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
