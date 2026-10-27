import type { NoticeLine } from "@/lib/requests/notices";

const SOCIAL_NOTICES = {
  approved: { ok: true, text: "Approved. Thank you, we will publish on the dates shown." },
  changed: { ok: false, text: "Some posts changed while you were looking. Check them below and try again." },
  failed: { ok: false, text: "We could not save that. Try again." },
} as const satisfies Readonly<Record<string, NoticeLine>>;

/** What the Social & Ads page says for `?notice=` after an approval; null for anything but the three words the action sends. */
export function socialNoticeLine(value: string | readonly string[] | undefined): NoticeLine | null {
  if (typeof value !== "string" || !Object.hasOwn(SOCIAL_NOTICES, value)) return null;
  return SOCIAL_NOTICES[value as keyof typeof SOCIAL_NOTICES];
}
