'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdminCharacter } from '@/lib/characters-api';
import { createCharacterAction, uploadCharacterImageAction } from '@/lib/character-actions';

export function CharactersList({ initialCharacters }: { initialCharacters: AdminCharacter[] }) {
  const router = useRouter();
  const [characters] = useState(initialCharacters);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [newName, setNewName] = useState('');
  const [newFranchise, setNewFranchise] = useState('');
  const [newPersonality, setNewPersonality] = useState('');
  const [newGender, setNewGender] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createCharacterAction({
        name: newName,
        franchise: newFranchise || undefined,
        personality: newPersonality || undefined,
        gender: newGender || undefined,
      });
      if (newImageFile && created?.id) {
        const buffer = await newImageFile.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        await uploadCharacterImageAction(created.id, {
          base64,
          filename: newImageFile.name,
          mimeType: newImageFile.type || 'image/jpeg',
        });
      }
      setShowCreate(false);
      setNewName('');
      setNewFranchise('');
      setNewPersonality('');
      setNewGender('');
      setNewImageFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar personagem');
    } finally {
      setCreating(false);
    }
  }, [newName, newFranchise, newPersonality, newGender, newImageFile, router]);

  // Filter characters
  const q = search.toLowerCase().trim();
  const filtered = q
    ? characters.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.franchise?.toLowerCase().includes(q)) ||
          (c.personality?.toLowerCase().includes(q)),
      )
    : characters;

  // Group by franchise
  const grouped = new Map<string, AdminCharacter[]>();
  for (const c of filtered) {
    const key = c.franchise || 'Sem franquia';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => {
    if (a === 'Sem franquia') return 1;
    if (b === 'Sem franquia') return -1;
    return a.localeCompare(b, 'pt-BR');
  });

  const activeCount = characters.filter((c) => c.isActive).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Personagens</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {activeCount} ativos de {characters.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] w-48"
          />
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            + Novo
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-[var(--border)] rounded-lg p-5 mb-6 bg-[var(--card)]">
          <h3 className="font-semibold mb-4">Criar Personagem</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome *"
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
            />
            <input
              type="text"
              value={newFranchise}
              onChange={(e) => setNewFranchise(e.target.value)}
              placeholder="Franquia (ex: Frozen)"
              className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)]"
            />
            <input
              type="text"
              value={newGender}
              onChange={(e) => setNewGender(e.target.value)}
              placeholder="Gênero (ex: feminino)"
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
          <div className="flex items-center gap-3">
            <label className="cursor-pointer text-sm">
              <span className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm inline-block">
                {newImageFile ? `📷 ${newImageFile.name}` : '📷 Escolher imagem'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setNewImageFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex-1" />
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm hover:bg-[var(--muted)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--success)', color: 'white' }}
            >
              {creating ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {/* Character list grouped by franchise */}
      {filtered.length === 0 ? (
        <p className="text-center text-[var(--muted-foreground)] py-16">
          {search ? 'Nenhum personagem encontrado.' : 'Nenhum personagem cadastrado.'}
        </p>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map(([franchise, chars]) => (
            <div key={franchise}>
              <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3 border-b border-[var(--border)] pb-2">
                {franchise} <span className="font-normal">({chars.length})</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {chars.map((char) => (
                  <Link
                    key={char.id}
                    href={`/characters/${char.id}`}
                    className="group border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--primary)] hover:shadow-md transition-all"
                    style={{ opacity: char.isActive ? 1 : 0.45 }}
                  >
                    {/* Image */}
                    <div className="aspect-square bg-[var(--muted)] relative">
                      {char.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={char.previewUrl}
                          alt={char.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--muted-foreground)]">
                          🎭
                        </div>
                      )}
                      {!char.isActive && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500 text-white">
                          OFF
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p className="font-medium text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                        {char.name}
                      </p>
                      {char.gender && (
                        <p className="text-[11px] text-[var(--muted-foreground)] truncate">{char.gender}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
