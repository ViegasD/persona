'use server';

import {
  createCharacter,
  updateCharacter,
  uploadCharacterImage,
  deleteCharacterImage,
  deactivateCharacter,
} from '@/lib/characters-api';

export async function createCharacterAction(data: {
  name: string;
  slug?: string;
  personality?: string;
  franchise?: string;
  tags?: string[];
  gender?: string;
  ageRange?: string;
}) {
  return createCharacter(data);
}

export async function updateCharacterAction(
  id: string,
  data: {
    name?: string;
    personality?: string;
    franchise?: string;
    tags?: string[];
    gender?: string;
    ageRange?: string;
    isActive?: boolean;
  },
) {
  return updateCharacter(id, data);
}

export async function uploadCharacterImageAction(
  id: string,
  image: { base64: string; filename?: string; mimeType?: string },
) {
  return uploadCharacterImage(id, image);
}

export async function deleteCharacterImageAction(id: string, s3Key: string) {
  return deleteCharacterImage(id, s3Key);
}

export async function deactivateCharacterAction(id: string) {
  return deactivateCharacter(id);
}
