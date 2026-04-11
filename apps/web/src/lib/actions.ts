'use server';

import { approveAllImages, regenerateImage, generateSession, sendAdminMessage, toggleAi } from '@/lib/api';

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

export async function sendMessageAction(
  leadId: string,
  content: string,
): Promise<{ success: boolean }> {
  return sendAdminMessage(leadId, content);
}

export async function toggleAiAction(
  leadId: string,
  enabled: boolean,
): Promise<{ success: boolean; aiEnabled: boolean }> {
  return toggleAi(leadId, enabled);
}
