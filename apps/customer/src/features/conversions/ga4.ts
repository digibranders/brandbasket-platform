/** The campaign words a sign-up kept, as they are named in the address. */
export interface Ga4Campaign {
  readonly utm_source?: string | null;
  readonly utm_medium?: string | null;
  readonly utm_campaign?: string | null;
  readonly utm_term?: string | null;
  readonly utm_content?: string | null;
}

export interface Ga4PurchaseInput {
  readonly clientId: string;
  readonly sessionId: string | null;
  /** The provider's payment id: GA4 counts one purchase per transaction id, so the browser's event and this one are one sale. */
  readonly transactionId: string;
  readonly valueCents: number;
  readonly currency: "INR" | "USD";
  readonly paidAt: Date;
  readonly now: Date;
  readonly campaign: Ga4Campaign;
}

export interface Ga4Body {
  readonly client_id: string;
  readonly timestamp_micros?: string;
  readonly events: readonly [{ readonly name: "purchase" | "sign_up"; readonly params: Readonly<Record<string, unknown>> }];
}

/** Google takes an event stamped up to 72 hours back; older ones are sent without a time and count as now. */
const MAX_BACKDATE_MS = 72 * 60 * 60 * 1000;

const CAMPAIGN_PARAMS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_term", "term"],
  ["utm_content", "content"],
] as const;

function campaignParams(campaign: Ga4Campaign): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [from, to] of CAMPAIGN_PARAMS) {
    const word = campaign[from];
    if (word) params[to] = word;
  }
  return params;
}

/** The Measurement Protocol body for a sign-up from an ad (plan 59), on the visitor's own GA4 client and session. Pure. */
export function buildGa4SignUp(input: { readonly clientId: string; readonly sessionId: string | null; readonly campaign: Ga4Campaign }): Ga4Body {
  return {
    client_id: input.clientId,
    events: [{ name: "sign_up", params: { method: "email", engagement_time_msec: 1, ...(input.sessionId === null ? {} : { session_id: input.sessionId }), ...campaignParams(input.campaign) } }],
  };
}

/** The Measurement Protocol body for a first payment (plan 59). Pure. */
export function buildGa4Purchase(input: Ga4PurchaseInput): Ga4Body {
  const value = input.valueCents / 100;
  const params: Record<string, unknown> = {
    transaction_id: input.transactionId,
    value,
    currency: input.currency,
    items: [{ item_id: "first-payment", item_name: "Brandbasket first payment", price: value, quantity: 1 }],
    engagement_time_msec: 1,
  };
  if (input.sessionId !== null) params.session_id = input.sessionId;
  Object.assign(params, campaignParams(input.campaign));
  const recent = input.now.getTime() - input.paidAt.getTime() <= MAX_BACKDATE_MS;
  return {
    client_id: input.clientId,
    ...(recent ? { timestamp_micros: String(input.paidAt.getTime() * 1000) } : {}),
    events: [{ name: "purchase", params }],
  };
}
