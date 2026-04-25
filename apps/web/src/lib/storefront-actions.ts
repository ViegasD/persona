'use server';

import { revalidatePath } from 'next/cache';
import { approveStorefrontItem, rejectStorefrontItem, retryStorefrontItem } from '@/lib/storefront-api';

export async function approveItemAction(itemId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await approveStorefrontItem(itemId);
    revalidatePath('/approvals');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function rejectItemAction(itemId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await rejectStorefrontItem(itemId);
    revalidatePath('/approvals');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function retryItemAction(itemId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await retryStorefrontItem(itemId);
    revalidatePath('/approvals');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
