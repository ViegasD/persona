'use server';

import { approveAllImages, regenerateImage, generateSession } from '@/lib/api';

export async function approveAllAction(
  sessionId: string,
): Promise<{ success: boolean; message: string }> {
  return approveAllImages(sessionId);
}

export async function regenerateAction(
  imageId: string,
): Promise<{ success: boolean; generationJobId?: string }> {
  return regenerateImage(imageId);
}

export async function generateSessionAction(
  sessionId: string,
): Promise<{ success: boolean; generationJobId?: string }> {
  return generateSession(sessionId);
}
