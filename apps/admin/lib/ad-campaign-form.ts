import { AD_PLATFORMS, type AdCampaignFigures } from "@brandbasket/db";
import { z } from "zod";
import { COUNT_MAX, RUPEES_MAX, whole } from "@/lib/numbers-form";

export const AD_PLATFORM_LABELS: Readonly<Record<(typeof AD_PLATFORMS)[number], string>> = { meta: "Meta (Facebook and Instagram)", google: "Google" };

export type CampaignParse =
  | { readonly success: true; readonly data: AdCampaignFigures }
  | { readonly success: false; readonly field: string; readonly message: string };

const TODAY_INDIA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** A whole number box: blank is null, anything else must be a whole number up to `max`. */
const count = (max: number, message = "Use whole numbers only.") =>
  z
    .string()
    .transform((raw) => whole(raw))
    .pipe(z.number({ error: message }).int({ error: message }).min(0, { error: message }).max(max, { error: `Enter ${max.toLocaleString("en-US")} or less.` }).nullable());

const text = (label: string) => z.string().trim().min(1, { error: `Enter ${label}.` }).max(120, { error: `Keep ${label} to 120 characters.` });

const figuresSchema = z.object({
  name: text("the campaign's name"),
  platform: z.enum(AD_PLATFORMS, { error: "Choose Meta or Google." }),
  objective: text("what the campaign is for"),
  spendRupees: count(RUPEES_MAX).pipe(z.number({ error: "Enter what it spent." })),
  budgetRupees: count(RUPEES_MAX),
  impressions: count(COUNT_MAX),
  clicks: count(COUNT_MAX),
  leads: count(COUNT_MAX),
});

/** Checks one campaign's boxes. Rupees become paise; a blank optional box becomes null (not measured, never zero). */
export function parseCampaignForm(input: Readonly<Record<string, string>>): CampaignParse {
  const parsed = figuresSchema.safeParse(
    Object.fromEntries(Object.keys(figuresSchema.shape).map((key) => [key, input[key] ?? ""])),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, field: String(issue?.path[0] ?? "name"), message: issue?.message ?? "Check the campaign." };
  }
  const { name, platform, objective, spendRupees, budgetRupees, impressions, clicks, leads } = parsed.data;
  return {
    success: true,
    data: { name, platform, objective, spendCents: spendRupees * 100, budgetCents: budgetRupees === null ? null : budgetRupees * 100, impressions, clicks, leads },
  };
}

/** `YYYY-MM` from the form to the first of the month, or null for a bad month or one after this month (India time). */
export function parseCampaignMonth(raw: string, now: Date): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw) || raw > TODAY_INDIA.format(now).slice(0, 7)) return null;
  return `${raw}-01`;
}
