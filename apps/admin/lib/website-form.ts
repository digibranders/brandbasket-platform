import { z } from "zod";

export const HOLD_REASON_MIN = 3;
export const HOLD_REASON_MAX = 200;

const reasonSchema = z
  .string()
  .trim()
  .min(HOLD_REASON_MIN, "Say why in at least 3 characters.")
  .max(HOLD_REASON_MAX, "Keep the reason to 200 characters.");

export type ParsedHold = { readonly success: true; readonly reason: string } | { readonly success: false; readonly message: string };

/** The pause form: one field, read by the customer exactly as typed. */
export function parseHoldForm(value: FormDataEntryValue | null): ParsedHold {
  const parsed = reasonSchema.safeParse(typeof value === "string" ? value : "");
  return parsed.success ? { success: true, reason: parsed.data } : { success: false, message: parsed.error.issues[0]?.message ?? "Check the reason." };
}

export type WebsiteMoveNotice = "building" | "paused" | "resumed" | "invalid" | "not-allowed" | "picture-taken" | "picture-failed";
export const WEBSITE_MOVE_NOTICES: Readonly<Record<WebsiteMoveNotice, { readonly text: string; readonly ok: boolean }>> = {
  building: { text: "Marked as building. The customer sees a dated line.", ok: true },
  paused: { text: "Put on hold. The customer sees your reason.", ok: true },
  resumed: { text: "Resumed. The customer sees a dated line.", ok: true },
  invalid: { text: "Give a reason of 3 to 200 characters.", ok: false },
  "not-allowed": { text: "The project is not at a stage where that move works.", ok: false },
  "picture-taken": { text: "Picture taken.", ok: true },
  "picture-failed": { text: "The picture could not be taken. Check the preview link, or try again later.", ok: false },
};

export function websiteMoveHref(businessId: string, notice: WebsiteMoveNotice): string {
  return `/clients/${businessId}?website=${notice}#website`;
}

export function readWebsiteMoveNotice(value: string | string[] | undefined): WebsiteMoveNotice | null {
  return typeof value === "string" && Object.hasOwn(WEBSITE_MOVE_NOTICES, value) ? (value as WebsiteMoveNotice) : null;
}
