'use server';

import { revalidatePath } from 'next/cache';
import {
  approveStorefrontItem,
  rejectStorefrontItem,
  retryStorefrontItem,
  createAffiliate,
  updateAffiliate,
  markCommissionPaid,
} from '@/lib/storefront-api';

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

// ── Affiliate actions ──────────────────────────────────────────────────────

export async function createAffiliateAction(data: {
  name: string;
  email?: string;
  commission_pct: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await createAffiliate(data);
    revalidatePath('/affiliates');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateAffiliateAction(
  id: number,
  data: { name?: string; email?: string; commission_pct?: number; is_active?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await updateAffiliate(id, data);
    revalidatePath('/affiliates');
    revalidatePath(`/affiliates/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function markCommissionPaidAction(
  affiliateId: number,
  orderId: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await markCommissionPaid(affiliateId, orderId);
    revalidatePath(`/affiliates/${affiliateId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
