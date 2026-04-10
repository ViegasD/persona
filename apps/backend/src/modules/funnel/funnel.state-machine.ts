/**
 * Máquina de estados do funil de vendas (v2 — LLM-powered).
 *
 * Fluxo simplificado:
 *   ENGAGING → COLLECTING_PHOTOS → COLLECTING_STYLE_REFS → UPSELLING → CONFIRMING_DATA → AWAITING_PAYMENT → PAID
 *   → GENERATING → GALLERY_SENT → APPROVING → DELIVERING → DELIVERED
 *
 * ENGAGING agrupa: boas-vindas, qualificação, oferta, coleta de preferências (nome, pacote, ocasião).
 * O LLM lida com a conversa de forma fluida dentro de cada estado.
 *
 * Saídas alternativas:
 *   Qualquer estado → CHURNED (timeout ou desistência)
 *   CHURNED → ENGAGING (reativação)
 */

export const FUNNEL_STATES = {
  ENGAGING: 'ENGAGING',
  COLLECTING_PHOTOS: 'COLLECTING_PHOTOS',
  COLLECTING_STYLE_REFS: 'COLLECTING_STYLE_REFS',
  UPSELLING: 'UPSELLING',
  CONFIRMING_DATA: 'CONFIRMING_DATA',
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

/**
 * Transições válidas da máquina de estados.
 */
export const TRANSITIONS: Record<FunnelState, FunnelState[]> = {
  ENGAGING: ['COLLECTING_PHOTOS', 'CHURNED'],
  COLLECTING_PHOTOS: ['COLLECTING_STYLE_REFS', 'UPSELLING', 'CONFIRMING_DATA', 'AWAITING_PAYMENT', 'ENGAGING', 'CHURNED'],
  COLLECTING_STYLE_REFS: ['UPSELLING', 'CONFIRMING_DATA', 'AWAITING_PAYMENT', 'CHURNED'],  // style refs ok → upsell (or skip if top pkg)
  UPSELLING: ['CONFIRMING_DATA', 'AWAITING_PAYMENT', 'CHURNED'],                           // upsell attempt → confirmation
  CONFIRMING_DATA: ['AWAITING_PAYMENT', 'CHURNED'],               // confirmed → payment
  AWAITING_PAYMENT: ['PAID', 'ENGAGING', 'CHURNED'],                   // pode mudar pacote
  PAID: ['GENERATING'],
  GENERATING: ['GALLERY_SENT'],
  GALLERY_SENT: ['APPROVING'],
  APPROVING: ['DELIVERING'],
  DELIVERING: ['DELIVERED'],
  DELIVERED: ['ENGAGING'],    // novo ensaio
  CHURNED: ['ENGAGING'],      // reativação
};

/**
 * Valida se a transição de estado é permitida.
 */
export function canTransition(from: FunnelState, to: FunnelState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Maps a funnel state to the agent that handles it.
 */
export function getAgentForState(state: FunnelState): string {
  switch (state) {
    case FUNNEL_STATES.ENGAGING:
      return 'engagement';
    case FUNNEL_STATES.COLLECTING_PHOTOS:
      return 'photo-collection';
    case FUNNEL_STATES.COLLECTING_STYLE_REFS:
      return 'style-collection';
    case FUNNEL_STATES.UPSELLING:
      return 'upsell';
    case FUNNEL_STATES.CONFIRMING_DATA:
      return 'confirmation';
    case FUNNEL_STATES.AWAITING_PAYMENT:
      return 'payment';
    case FUNNEL_STATES.PAID:
    case FUNNEL_STATES.GENERATING:
    case FUNNEL_STATES.GALLERY_SENT:
    case FUNNEL_STATES.APPROVING:
    case FUNNEL_STATES.DELIVERING:
      return 'support';
    case FUNNEL_STATES.DELIVERED:
      return 'reengagement';
    default:
      return 'engagement';
  }
}

/**
 * Gets the next state to transition to from the current state.
 * Returns the primary (happy-path) next state.
 */
export function getNextState(from: FunnelState): FunnelState {
  const nexts = TRANSITIONS[from];
  return nexts[0]; // First entry is the happy path
}
