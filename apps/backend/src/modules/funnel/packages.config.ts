/**
 * Package definitions for the AI video service.
 */

export interface Package {
  id: string;
  photos: number;  // legacy — kept for backward compatibility
  videos: number;  // number of videos in this package
  price: number;    // BRL
  name: string;     // Short name (e.g. "Plano Teste")
  icon: string;     // Emoji used in offer lists
  label: string;    // Human-readable, used in prompts
  popular: boolean; // Highlighted in the offer
  popularNote?: string;        // Extra note shown next to the price (e.g. "(mais escolhido)")
  occasionLock?: string;       // If set, forces preferences.messageType to this value
  randomCharacter?: boolean;   // If true, system auto-picks a random character (client doesn't choose)
}

export const PACKAGES: Package[] = [
  { id: 'pkg_1',       photos: 0, videos: 1, price: 19.90, name: 'Plano Teste',        icon: '✨', label: 'Plano Teste — 1 vídeo aleatório — R$ 19,90',             popular: false, randomCharacter: true },
  { id: 'pkg_3',       photos: 0, videos: 3, price: 29.90, name: 'Plano Surpresa',     icon: '⭐', label: 'Plano Surpresa — 3 vídeos — R$ 29,90',                   popular: true,  popularNote: '(mais escolhido)' },
  { id: 'pkg_5',       photos: 0, videos: 5, price: 49.90, name: 'Plano Completo',     icon: '🎁', label: 'Plano Completo — 5 vídeos — R$ 49,90',                   popular: false },
  { id: 'pkg_aniv_1',  photos: 0, videos: 1, price: 34.90, name: 'Vídeo de Aniversário', icon: '🎂', label: 'Vídeo de Aniversário — 1 vídeo especial — R$ 34,90', popular: false, occasionLock: 'aniversario' },
];

export function getPackageById(id: string): Package | undefined {
  return PACKAGES.find((p) => p.id === id);
}

export function getPackageByPhotos(photos: number): Package | undefined {
  return PACKAGES.find((p) => p.photos === photos);
}

export function getPackageByVideos(videos: number): Package | undefined {
  return PACKAGES.find((p) => p.videos === videos);
}

/**
 * Formats the packages list for display in system prompts.
 */
export function formatPackagesForPrompt(): string {
  return PACKAGES
    .map((p) => {
      const price = `R$ ${p.price.toFixed(2).replace('.', ',')}`;
      const randomTag = p.randomCharacter ? ' aleatório' : '';
      const videoLabel = `${p.videos} vídeo${p.videos > 1 ? 's' : ''}${randomTag}${p.occasionLock === 'aniversario' ? ' especial' : ''}`;
      const note = p.popularNote ? ` ${p.popularNote}` : '';
      return `${p.icon} *${p.name}* — ${videoLabel} — ${price}${note}`;
    }).join('\n');
}

/**
 * Known message types and their prompt keywords for video generation.
 */
export const OCCASIONS: Record<string, { label: string; promptHint: string }> = {
  aniversario:   { label: 'Aniversário',     promptHint: 'birthday celebration, festive, balloons, cake, party' },
  parabens:      { label: 'Parabéns',        promptHint: 'congratulations, celebration, achievement, joy' },
  motivacao:     { label: 'Motivação',        promptHint: 'motivation, encouragement, confidence, energy' },
  natal:         { label: 'Natal',            promptHint: 'Christmas, holiday, festive, warm, cozy' },
  'dia-das-maes':{ label: 'Dia das Mães',    promptHint: 'mothers day, love, gratitude, flowers, tenderness' },
  'dia-dos-pais':{ label: 'Dia dos Pais',    promptHint: 'fathers day, pride, gratitude, warmth' },
  casamento:     { label: 'Casamento',        promptHint: 'wedding congratulations, love, celebration, elegant' },
  formatura:     { label: 'Formatura',        promptHint: 'graduation, achievement, pride, academic' },
  boas_festas:   { label: 'Boas Festas',     promptHint: 'holiday greetings, festive, celebration, joy' },
  amor:          { label: 'Declaração de Amor', promptHint: 'love declaration, romance, heartfelt, tender' },
  personalizado: { label: 'Personalizado',    promptHint: 'custom message, personalized greeting' },
};

export function getOccasionPromptHint(occasion: string): string {
  const key = occasion.toLowerCase().trim();
  return OCCASIONS[key]?.promptHint ?? `${occasion} themed photography`;
}
