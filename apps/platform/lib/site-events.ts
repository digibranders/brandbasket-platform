/** The most bytes the site events route reads from a request body. */
export const SITE_EVENT_BODY_LIMIT = 256;

const KINDS = ["call", "whatsapp", "form"] as const;

export type SiteEventParse = { readonly ok: true; readonly kind: (typeof KINDS)[number] } | { readonly ok: false };

/** A body is a JSON object with exactly one key, "kind", holding one of the three kinds. */
export function parseSiteEventBody(text: string): SiteEventParse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
  const keys = Object.keys(value);
  const kind = (value as Record<string, unknown>).kind;
  if (keys.length !== 1 || keys[0] !== "kind") return { ok: false };
  const match = KINDS.find((candidate) => candidate === kind);
  return match === undefined ? { ok: false } : { ok: true, kind: match };
}

/** This month's website contacts by kind, and last month's total. */
export interface WebsiteEnquiries {
  readonly call: number;
  readonly whatsapp: number;
  readonly form: number;
  readonly chatbot: number;
  readonly previous: number;
}

/** Null when the site sent no events at all, so the chatbot-only line stays. */
export function websiteEnquiriesLine(counts: WebsiteEnquiries): { readonly figure: string; readonly headline: string; readonly detail: string | null } | null {
  if (counts.call + counts.whatsapp + counts.form === 0) return null;
  const total = counts.call + counts.whatsapp + counts.form + counts.chatbot;
  const parts: string[] = [];
  if (counts.call > 0) parts.push(counts.call === 1 ? "1 call" : `${counts.call} calls`);
  if (counts.whatsapp > 0) parts.push(`${counts.whatsapp} WhatsApp`);
  if (counts.form > 0) parts.push(counts.form === 1 ? "1 form" : `${counts.form} forms`);
  if (counts.chatbot > 0) parts.push(`${counts.chatbot} chatbot`);
  if (counts.previous > 0 && counts.previous !== total) parts.push(counts.previous < total ? `up from ${counts.previous}` : `down from ${counts.previous}`);
  return {
    figure: String(total),
    headline: total === 1 ? "person contacted you from your website" : "people contacted you from your website",
    detail: parts.join(", "),
  };
}
