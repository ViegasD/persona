/**
 * Package definitions for the AI video service.
 */

export interface Package {
  id: string;
  photos: number;  // legacy — kept for backward compatibility
  videos: number;  // number of videos in this package
  price: number;    // BRL
  label: string;    // Human-readable, used in prompts
  popular: boolean; // Highlighted in the offer
}

export const PACKAGES: Package[] = [
  { id: 'pkg_1',  photos: 0, videos: 1,  price: 9.90,   label: '1 vídeo — R$ 9,90',    popular: false },
  { id: 'pkg_2',  photos: 0, videos: 2,  price: 14.90,  label: '2 vídeos — R$ 14,90',   popular: false },
  { id: 'pkg_3',  photos: 0, videos: 3,  price: 19.90,  label: '3 vídeos — R$ 19,90',   popular: true },
  { id: 'pkg_5',  photos: 0, videos: 5,  price: 29.90,  label: '5 vídeos — R$ 29,90',   popular: false },
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
    .map((p) =>
      `${p.popular ? '🎁' : '📦'} ${p.videos} vídeo${p.videos > 1 ? 's' : ''} — R$ ${p.price.toFixed(2).replace('.', ',')}${p.popular ? ' (mais popular)' : ''}`,
    ).join('\n');
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
