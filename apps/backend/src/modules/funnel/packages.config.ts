/**
 * Package definitions for the AI photo shoot service.
 */

export interface Package {
  id: string;
  photos: number;
  price: number;    // EUR
  label: string;    // Human-readable, used in prompts
  popular: boolean; // Highlighted in the offer
}

export const PACKAGES: Package[] = [
  { id: 'pkg_2',  photos: 2,  price: 4.90,  label: '2 fotos — € 4,90',  popular: false },
  { id: 'pkg_3',  photos: 3,  price: 6.90,  label: '3 fotos — € 6,90',  popular: false },
  { id: 'pkg_5',  photos: 5,  price: 9.90,  label: '5 fotos — € 9,90',  popular: false },
  { id: 'pkg_10', photos: 10, price: 16.90, label: '10 fotos — € 16,90', popular: true },
];

/**
 * Returning-customer (loyalty) packages — ~20% discount applied.
 * IDs follow the pattern `pkg_ret_N` so payment service resolves correct price.
 */
export const RETURNING_PACKAGES: Package[] = [
  { id: 'pkg_ret_2',  photos: 2,  price: 3.90,  label: '2 fotos — € 3,90',  popular: false },
  { id: 'pkg_ret_3',  photos: 3,  price: 5.50,  label: '3 fotos — € 5,50',  popular: false },
  { id: 'pkg_ret_5',  photos: 5,  price: 7.90,  label: '5 fotos — € 7,90',  popular: false },
  { id: 'pkg_ret_10', photos: 10, price: 13.90, label: '10 fotos — € 13,90', popular: true },
];

export function getPackageById(id: string): Package | undefined {
  return PACKAGES.find((p) => p.id === id) ?? RETURNING_PACKAGES.find((p) => p.id === id);
}

/**
 * Formats the returning-customer packages for display in system prompts.
 */
export function formatReturningPackagesForPrompt(): string {
  return RETURNING_PACKAGES.map((p) =>
    `${p.popular ? '🎁' : '📦'} ${p.photos} fotos — € ${p.price.toFixed(2).replace('.', ',')}${p.popular ? ' (mais pedido)' : ''}`,
  ).join('\n');
}

export function getPackageByPhotos(photos: number): Package | undefined {
  return PACKAGES.find((p) => p.photos === photos);
}

/**
 * Formats the packages list for display in system prompts.
 */
export function formatPackagesForPrompt(): string {
  return PACKAGES.map((p) =>
    `${p.popular ? '🎁' : '📦'} ${p.photos} fotos — € ${p.price.toFixed(2).replace('.', ',')}${p.popular ? ' (mais pedido)' : ''}`,
  ).join('\n');
}

/**
 * Known occasion types and their prompt keywords.
 */
export const OCCASIONS: Record<string, { label: string; promptHint: string }> = {
  aniversario:   { label: 'Aniversário',   promptHint: 'birthday celebration, party decorations, balloons, birthday cake' },
  profissional:  { label: 'Profissional',  promptHint: 'professional corporate headshot, business attire, clean background' },
  fim_de_curso:  { label: 'Fim de Curso',  promptHint: 'graduation ceremony, academic cap and gown, diploma' },
  casal:         { label: 'Casal',         promptHint: 'romantic couple portrait, warm intimate mood, soft lighting' },
  gravidez:      { label: 'Gravidez',      promptHint: 'maternity photography, gentle pose, flowing dress, baby bump' },
  casual:        { label: 'Casual',        promptHint: 'casual lifestyle photography, relaxed pose, natural setting' },
  familia:       { label: 'Família',       promptHint: 'family portrait, warm colors, joyful expressions, group photo' },
  infantil:      { label: 'Infantil',      promptHint: 'children photography, playful, colorful, fun setting' },
  fitness:       { label: 'Fitness',       promptHint: 'fitness photography, athletic pose, gym or outdoor workout setting' },
  natalino:      { label: 'Natal',         promptHint: 'Christmas themed portrait, festive decorations, red and green colors' },
  pet:           { label: 'Com Pet',       promptHint: 'portrait with pet, pet and owner, heartwarming' },
};

export function getOccasionPromptHint(occasion: string): string {
  const key = occasion.toLowerCase().trim();
  return OCCASIONS[key]?.promptHint ?? `${occasion} themed photography`;
}
