import { z } from "zod";
import { cleanCampaign, normalizePath } from "./normalize-path";
import { referrerHost } from "./classify-channel";

/** The most characters the ingest route reads from a body. */
export const HIT_BODY_LIMIT = 1024;

export const HIT_KINDS = ["pageview", "engagement", "call", "whatsapp", "email", "directions", "social", "outbound", "download", "form", "custom"] as const;
export type HitKind = (typeof HIT_KINDS)[number];

/** The script's message. Strict: a field not listed here, such as an email address, makes the whole message invalid. */
const messageSchema = z.strictObject({
  key: z.string().regex(/^bbk_[A-Za-z0-9]{16,40}$/),
  kind: z.enum(HIT_KINDS),
  path: z.string().min(1).max(500),
  ref: z.string().max(500).optional(),
  source: z.string().max(100).optional(),
  medium: z.string().max(100).optional(),
  campaign: z.string().max(100).optional(),
  label: z.string().max(100).optional(),
  engagedMs: z.number().int().min(0).max(1_800_000).optional(),
  scrollPct: z.number().int().min(0).max(100).optional(),
});

/** A message after validation and tidying: nothing in it is raw. */
export interface ParsedHit {
  readonly key: string;
  readonly kind: HitKind;
  readonly path: string;
  readonly referrerHost: string | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  /** A host (outbound, social), a file type (download) or a name (custom); null otherwise. */
  readonly label: string | null;
  readonly engagedMs: number | null;
  readonly scrollPct: number | null;
}

const HOST_LABEL = /^[a-z0-9.-]{1,100}$/;
const CUSTOM_LABEL = /^[a-z0-9_-]{1,40}$/;

/** Reads the script's message, or returns null when it is not valid. */
export function parseHit(text: string): ParsedHit | null {
  if (text.length > HIT_BODY_LIMIT) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) return null;
  const message = parsed.data;
  const path = normalizePath(message.path);
  if (path === null) return null;

  const label = message.label?.trim().toLowerCase() ?? null;
  let kept: string | null = null;
  if (message.kind === "custom") {
    if (label === null || !CUSTOM_LABEL.test(label)) return null;
    kept = label;
  } else if (message.kind === "outbound" || message.kind === "social" || message.kind === "download") {
    kept = label !== null && HOST_LABEL.test(label) ? label : null;
  }
  const engagement = message.kind === "engagement";
  return {
    key: message.key,
    kind: message.kind,
    path,
    referrerHost: referrerHost(message.ref),
    utmSource: cleanCampaign(message.source),
    utmMedium: cleanCampaign(message.medium),
    utmCampaign: cleanCampaign(message.campaign),
    label: kept,
    engagedMs: engagement ? (message.engagedMs ?? null) : null,
    scrollPct: engagement ? (message.scrollPct ?? null) : null,
  };
}
