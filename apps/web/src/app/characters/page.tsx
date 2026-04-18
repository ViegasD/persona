import { fetchCharacters } from '@/lib/characters-api';
import { CharactersList } from './characters-list';

export default async function CharactersPage() {
  let characters;
  try {
    characters = await fetchCharacters();
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar personagens</p>
        <p className="text-[var(--muted-foreground)] mt-2">Verifique se o backend está rodando.</p>
      </div>
    );
  }

  return <CharactersList initialCharacters={characters} />;
}
