import { CONNECTED_ACCOUNT_STATUSES, CONNECTED_PLATFORMS, type ConnectedAccountInput } from "@brandbasket/db";
import { z } from "zod";
import { occurredAtFor } from "@/lib/updates-form";

export const PLATFORM_LABELS: Readonly<Record<(typeof CONNECTED_PLATFORMS)[number], string>> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
  google_business: "Google Business Profile",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  whatsapp_business: "WhatsApp Business",
};

export const STATUS_LABELS: Readonly<Record<(typeof CONNECTED_ACCOUNT_STATUSES)[number], string>> = {
  connected: "Connected",
  needs_attention: "Needs attention",
  not_connected: "Not connected",
};

export type AccountParse =
  | { readonly success: true; readonly data: Omit<ConnectedAccountInput, "businessId"> }
  | { readonly success: false; readonly field: string; readonly message: string };

const blankToNull = (raw: string): string | null => (raw.trim() === "" ? null : raw.trim());

const schema = z.object({
  platform: z.enum(CONNECTED_PLATFORMS, { error: "Choose an account." }),
  handle: z.string().transform(blankToNull).pipe(z.string().max(120, { error: "Keep the handle to 120 characters." }).nullable()),
  url: z
    .string()
    .transform(blankToNull)
    .pipe(z.url({ protocol: /^https$/, error: "The link must start with https://" }).max(500, { error: "Keep the link to 500 characters." }).nullable()),
  status: z.enum(CONNECTED_ACCOUNT_STATUSES, { error: "Choose a status." }),
  checkedOn: z
    .string()
    .transform(blankToNull)
    .pipe(z.iso.date({ error: "Enter the date as day, month and year." }).nullable())
    .refine((date) => date === null || date >= "2000-01-01", { error: "Enter the date as day, month and year." }),
});

/** Checks the connected account form. `todayIso` is today's date in India as YYYY-MM-DD; a check date after it is refused. */
export function parseAccountForm(input: Readonly<Record<string, string>>, todayIso: string): AccountParse {
  const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((key) => [key, input[key] ?? ""])));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, field: String(issue?.path[0] ?? "platform"), message: issue?.message ?? "Check the account." };
  }
  const { platform, handle, url, status, checkedOn } = parsed.data;
  if (checkedOn !== null && checkedOn > todayIso) return { success: false, field: "checkedOn", message: "That date is in the future." };
  return { success: true, data: { platform, handle, url, status, checkedAt: checkedOn === null ? null : occurredAtFor(checkedOn) } };
}
