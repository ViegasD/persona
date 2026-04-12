'use server';

import {
  createOccasion,
  uploadTemplates,
  updateTemplate,
  deleteTemplate,
  regeneratePrompt,
  seedOccasions,
  syncTemplates,
} from '@/lib/templates-api';

export async function createOccasionAction(data: { slug: string; label: string; promptHint?: string }) {
  return createOccasion(data);
}

export async function uploadTemplatesAction(
  slug: string,
  images: Array<{ base64: string; filename?: string; mimeType?: string }>,
) {
  return uploadTemplates(slug, images);
}

export async function updateTemplateAction(id: string, data: { scenePrompt?: string; tags?: string[]; gender?: string; expression?: string }) {
  return updateTemplate(id, data);
}

export async function deleteTemplateAction(id: string) {
  return deleteTemplate(id);
}

export async function regeneratePromptAction(id: string) {
  return regeneratePrompt(id);
}

export async function seedOccasionsAction() {
  return seedOccasions();
}

export async function syncTemplatesAction() {
  return syncTemplates();
}
