import { fetchCharacter } from '@/lib/characters-api';
import { notFound } from 'next/navigation';
import { CharacterEdit } from './character-edit';

export default async function CharacterEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let character;
  try {
    character = await fetchCharacter(id);
  } catch {
    notFound();
  }

  return <CharacterEdit character={character} />;
}
