/**
 * Simplified state machine (v2).
 *
 * Collapses 5 pre-payment states (ENGAGING, COLLECTING_PHOTOS, COLLECTING_STYLE_REFS,
 * UPSELLING, CONFIRMING_DATA) into a single CONVERSATION state.
 * Post-payment states remain unchanged.
 *
 * Flow:
 *   CONVERSATION → AWAITING_PAYMENT → PAID → GENERATING → GALLERY_SENT → APPROVING → DELIVERING → DELIVERED
 *
 * Alternate paths:
 *   Any → CHURNED (timeout)
 *   CHURNED → CONVERSATION (reactivation)
 *   DELIVERED → CONVERSATION (new session)
 *   AWAITING_PAYMENT → CONVERSATION (package change)
 */

export const FUNNEL_STATES = {
  CONVERSATION: 'CONVERSATION',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  GENERATING: 'GENERATING',
  GALLERY_SENT: 'GALLERY_SENT',
  APPROVING: 'APPROVING',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  CHURNED: 'CHURNED',
} as const;

export type FunnelState = (typeof FUNNEL_STATES)[keyof typeof FUNNEL_STATES];

export const TRANSITIONS: Record<FunnelState, FunnelState[]> = {
  CONVERSATION: ['AWAITING_PAYMENT', 'CHURNED'],
  AWAITING_PAYMENT: ['PAID', 'CONVERSATION', 'CHURNED'],
  PAID: ['GENERATING'],
  GENERATING: ['GALLERY_SENT'],
  GALLERY_SENT: ['APPROVING'],
  APPROVING: ['DELIVERING'],
  DELIVERING: ['DELIVERED'],
  DELIVERED: ['CONVERSATION', 'CHURNED'],
  CHURNED: ['CONVERSATION'],
};

export function canTransition(from: FunnelState, to: FunnelState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Maps old v1 state names (and legacy names) to v2 states.
 */
export function migrateState(state: string): FunnelState {
  const map: Record<string, FunnelState> = {
    // v1 → v2
    ENGAGING: 'CONVERSATION',
    COLLECTING_PHOTOS: 'CONVERSATION',
    COLLECTING_STYLE_REFS: 'CONVERSATION',
    UPSELLING: 'CONVERSATION',
    CONFIRMING_DATA: 'CONVERSATION',
    // Legacy (pre-v1)
    WELCOME: 'CONVERSATION',
    QUALIFICATION: 'CONVERSATION',
    OFFER: 'CONVERSATION',
    COLLECTING_STYLE: 'CONVERSATION',
    COLLECTING_SCENARIO: 'CONVERSATION',
    CONFIRM_PREFERENCES: 'CONVERSATION',
  };
  return (map[state] ?? state) as FunnelState;
}
