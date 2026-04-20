'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCharacterDetail } from '@/lib/characters-api';
import {
  updateCharacterAction,
  uploadCharacterImageAction,
  deleteCharacterImageAction,
  deactivateCharacterAction,
} from '@/lib/character-actions';

export function CharacterEdit({ character }: { character: AdminCharacterDetail }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState(character.name);
  const [franchise, setFranchise] = useState(character.franchise ?? '');
  const [personality, setPersonality] = useState(character.personality ?? '');
  const [gender, setGender] = useState(character.gender ?? '');

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateCharacterAction(character.id, {
        name: name.trim(),
        franchise: franchise.trim() || undefined,
        personality: personality.trim() || undefined,
        gender: gender.trim() || undefined,
      });
      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [character.id, name, franchise, personality, gender, router]);

  const handleToggle = useCallback(async () => {
    try {
      if (character.isActive) {
        await deactivateCharacterAction(character.id);
      } else {
        await updateCharacterAction(character.id, { isActive: true });
      }
      router.refresh();
      router.push('/characters');
    } catch {
      setError('Erro ao atualizar status');
    }
  }, [character.id, character.isActive, router]);

  const handleImageUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      // Delete existing images first (single image per character)
      for (const img of character.referenceImages) {
        await deleteCharacterImageAction(character.id, img.s3Key);
      }
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      await uploadCharacterImageAction(character.id, {
        base64,
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  }, [character.id, character.referenceImages, router]);

  const handleDeleteImage = useCallback(async (s3Key: string) => {
    setError(null);
    try {
      await deleteCharacterImageAction(character.id, s3Key);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover imagem');
    }
  }, [character.id, router]);

  const previewUrl = character.referenceImages?.[0]?.url;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/characters')}
          className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
        >
          ← Voltar
        </button>
        <h2 className="text-xl font-semibold flex-1">Editar Personagem</h2>
        <button
          onClick={handleToggle}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ background: character.isActive ? 'var(--error)' : 'var(--success)' }}
        >
          {character.isActive ? 'Desativar' : 'Ativar'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--success)', color: 'white' }}>
          Salvo com sucesso!
        </div>
      )}

      {/* Image section */}
      <div className="border border-[var(--border)] rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">Imagem de Referência</h3>
        <div className="flex items-start gap-4">
          <div className="w-32 h-32 rounded-lg bg-[var(--muted)] overflow-hidden flex-shrink-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={character.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">🎭</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer">
              <span
                className="inline-block px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {uploading ? 'Enviando...' : previewUrl ? '📷 Trocar Imagem' : '📷 Enviar Imagem'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {character.referenceImages.length > 0 && (
              <button
                onClick={() => handleDeleteImage(character.referenceImages[0].s3Key)}
                className="text-xs text-[var(--error)] hover:underline text-left"
              >
                Remover imagem
              </button>
            )}
            <p className="text-xs text-[var(--muted-foreground)]">
              Apenas 1 imagem por personagem. Enviar nova substitui a anterior.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="border border-[var(--border)] rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nome *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Franquia / Filme / Desenho</label>
          <input
            type="text"
            value={franchise}
            onChange={(e) => setFranchise(e.target.value)}
            placeholder="ex: Frozen, Patrulha Canina"
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Gênero</label>
          <input
            type="text"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            placeholder="ex: masculino, feminino"
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Personalidade / Descrição</label>
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={4}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--success)', color: 'white' }}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={() => router.push('/characters')}
            className="px-5 py-2 rounded-lg text-sm border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>

      {/* Meta info */}
      <div className="mt-4 text-xs text-[var(--muted-foreground)] space-y-1">
        <p>Slug: <code className="bg-[var(--muted)] px-1 py-0.5 rounded">{character.slug}</code></p>
        <p>ID: <code className="bg-[var(--muted)] px-1 py-0.5 rounded">{character.id}</code></p>
        <p>Criado em: {new Date(character.createdAt).toLocaleDateString('pt-BR')}</p>
      </div>
    </div>
  );
}
