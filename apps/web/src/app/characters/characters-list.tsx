'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCharacter } from '@/lib/characters-api';
import { createCharacterAction, updateCharacterAction, deactivateCharacterAction } from '@/lib/character-actions';

export function CharactersList({ initialCharacters }: { initialCharacters: AdminCharacter[] }) {
  const router = useRouter();
  const [characters] = useState(initialCharacters);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPersonality, setNewPersonality] = useState('');
  const [newGender, setNewGender] = useState('');
  const [newAgeRange, setNewAgeRange] = useState('');

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createCharacterAction({ name: newName, personality: newPersonality || undefined, gender: newGender || undefined, ageRange: newAgeRange || undefined });
      setShowCreate(false);
      setNewName('');
      setNewPersonality('');
      setNewGender('');
      setNewAgeRange('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar personagem');
    } finally {
      setCreating(false);
    }
  }, [newName, newPersonality, newGender, newAgeRange, router]);

  const handleToggle = useCallback(async (id: string, isActive: boolean) => {
    try {
      if (isActive) {
        await deactivateCharacterAction(id);
      } else {
        await updateCharacterAction(id, { isActive: true });
      }
      router.refresh();
    } catch {
      setError('Erro ao atualizar personagem');
    }
  }, [router]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">🎭 Personagens</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          + Novo Personagem
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-[var(--border)] rounded-lg p-5 mb-6">
          <h3 className="font-semibold mb-3">Criar Personagem</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome *"
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
            />
            <input
              type="text"
              value={newGender}
              onChange={(e) => setNewGender(e.target.value)}
              placeholder="Gênero (ex: masculino)"
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
            />
            <input
              type="text"
              value={newAgeRange}
              onChange={(e) => setNewAgeRange(e.target.value)}
              placeholder="Faixa etária (ex: criança, adulto)"
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
            />
          </div>
          <textarea
            value={newPersonality}
            onChange={(e) => setNewPersonality(e.target.value)}
            placeholder="Descrição / Personalidade"
            rows={2}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--success)', color: 'white' }}
            >
              {creating ? 'Criando...' : 'Criar'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'var(--muted)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Character list */}
      {characters.length === 0 ? (
        <p className="text-center text-[var(--muted-foreground)] py-16">
          Nenhum personagem cadastrado.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((char) => (
            <div
              key={char.id}
              className="border border-[var(--border)] rounded-lg overflow-hidden"
              style={{ opacity: char.isActive ? 1 : 0.5 }}
            >
              {/* Preview image */}
              <div className="aspect-[4/3] bg-[var(--muted)] relative">
                {char.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={char.previewUrl}
                    alt={char.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🎭</div>
                )}
                {!char.isActive && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">
                    Inativo
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold">{char.name}</h3>
                  <span className="text-xs text-[var(--muted-foreground)]">{char.referenceImageCount} imgs</span>
                </div>
                {char.personality && (
                  <p className="text-sm text-[var(--muted-foreground)] line-clamp-2 mb-2">{char.personality}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  {char.gender && <span>{char.gender}</span>}
                  {char.ageRange && <span>· {char.ageRange}</span>}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleToggle(char.id, char.isActive)}
                    className="px-3 py-1 rounded text-xs font-medium"
                    style={{
                      background: char.isActive ? 'var(--error)' : 'var(--success)',
                      color: 'white',
                    }}
                  >
                    {char.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
