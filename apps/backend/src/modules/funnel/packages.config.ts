/**
 * Package definitions for the AI photo shoot service.
 * Replaces the old single-price model (MAX_GENERATED_IMAGES + IMAGE_GENERATION_COST_BRL).
 */

export interface Package {
  id: string;
  photos: number;
  price: number;    // BRL
  label: string;    // Human-readable, used in prompts
  popular: boolean; // Highlighted in the offer
}

export const PACKAGES: Package[] = [
  { id: 'pkg_2', photos: 2, price: 11.90, label: '2 fotos — R$ 11,90', popular: false },
  { id: 'pkg_3', photos: 3, price: 16.90, label: '3 fotos — R$ 16,90', popular: false },
  { id: 'pkg_5', photos: 5, price: 27.90, label: '5 fotos — R$ 27,90', popular: false },
  { id: 'pkg_6', photos: 6, price: 34.90, label: '6 fotos — R$ 34,90', popular: true },
];

export function getPackageById(id: string): Package | undefined {
  return PACKAGES.find((p) => p.id === id);
}

export function getPackageByPhotos(photos: number): Package | undefined {
  return PACKAGES.find((p) => p.photos === photos);
}

/**
 * Formats the packages list for display in system prompts.
 */
export function formatPackagesForPrompt(): string {
  return PACKAGES.map((p) =>
    `${p.popular ? '🎁' : '📦'} ${p.photos} fotos — R$ ${p.price.toFixed(2).replace('.', ',')}${p.popular ? ' (mais popular)' : ''}`,
  ).join('\n');
}

/**
 * Known occasion types and their prompt keywords.
 */
export const OCCASIONS: Record<string, { label: string; promptHint: string }> = {
  aniversario:   { label: 'Aniversário',   promptHint: 'birthday celebration, party decorations, balloons, birthday cake' },
  profissional:  { label: 'Profissional',  promptHint: 'professional corporate headshot, business attire, clean background' },
  formatura:     { label: 'Formatura',     promptHint: 'graduation ceremony, academic cap and gown, diploma' },
  casal:         { label: 'Casal',         promptHint: 'romantic couple portrait, warm intimate mood, soft lighting' },
  gravidez:      { label: 'Gravidez',      promptHint: 'maternity photography, gentle pose, flowing dress, baby bump' },
  casual:        { label: 'Casual',        promptHint: 'casual lifestyle photography, relaxed pose, natural setting' },
  familia:       { label: 'Família',       promptHint: 'family portrait, warm colors, joyful expressions, group photo' },
  infantil:      { label: 'Infantil',      promptHint: 'children photography, playful, colorful, fun setting' },
  fitness:       { label: 'Fitness',       promptHint: 'fitness photography, athletic pose, gym or outdoor workout setting' },
  natalino:      { label: 'Natal',         promptHint: 'Christmas themed portrait, festive decorations, red and green colors' },
  debutante:     { label: 'Debutante',     promptHint: 'quinceañera / debutante ball, elegant dress, glamorous setting' },
  pet:           { label: 'Com Pet',       promptHint: 'portrait with pet, pet and owner, heartwarming' },
};

export function getOccasionPromptHint(occasion: string): string {
  const key = occasion.toLowerCase().trim();
  return OCCASIONS[key]?.promptHint ?? `${occasion} themed photography`;
}
