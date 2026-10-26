import type { SetupService, SnapshotFigures } from "@brandbasket/db";

export type NumbersParse =
  | { readonly success: true; readonly data: { readonly service: SetupService; readonly month: string; readonly figures: SnapshotFigures } }
  | { readonly success: false; readonly field: string; readonly message: string };

const BLANK: SnapshotFigures = {
  adSpendCents: null,
  adBudgetCents: null,
  adEnquiries: null,
  postsPublished: null,
  postsPlanned: null,
  keywordsPageOne: null,
  keywordsPageOnePrev: null,
};

// The database columns are 32 bit: 10,000,000 rupees is 1,000,000,000 paise, under 2,147,483,647.
const RUPEES_MAX = 10_000_000;
const COUNT_MAX = 1_000_000;

/** A whole number from what staff typed, null when blank, undefined when it is not one. Allows a leading rupee sign and commas between digits only. */
function whole(raw: string | undefined): number | null | undefined {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const match = /^(?:₹\s*)?(\d+(?:,\d+)*)$/.exec(text);
  const digits = match?.[1]?.replace(/,/g, "");
  return digits !== undefined && digits.length <= 15 ? Number(digits) : undefined;
}

/** Checks the monthly numbers form. Only the fields of the chosen service count; the others are ignored. */
export function parseNumbersForm(input: Readonly<Record<string, string>>): NumbersParse {
  const service = input["service"];
  if (service !== "social" && service !== "search") return { success: false, field: "service", message: "Choose Social & Ads or Search." };
  const month = input["month"] ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { success: false, field: "month", message: "Choose a month." };

  const names = service === "social" ? (["adSpendRupees", "adBudgetRupees", "adEnquiries", "postsPublished", "postsPlanned"] as const) : (["keywordsPageOne", "keywordsPageOnePrev"] as const);
  const read: Record<string, number | null> = {};
  for (const name of names) {
    const value = whole(input[name]);
    if (value === undefined) return { success: false, field: name, message: "Use whole numbers only." };
    const max = name.endsWith("Rupees") ? RUPEES_MAX : COUNT_MAX;
    if (value !== null && value > max) return { success: false, field: name, message: `Enter ${max.toLocaleString("en-US")} or less.` };
    read[name] = value;
  }
  if (names.every((name) => read[name] === null)) return { success: false, field: names[0], message: "Enter at least one number." };

  const paise = (rupees: number | null | undefined): number | null => (rupees === null || rupees === undefined ? null : rupees * 100);
  const figures: SnapshotFigures =
    service === "social"
      ? { ...BLANK, adSpendCents: paise(read["adSpendRupees"]), adBudgetCents: paise(read["adBudgetRupees"]), adEnquiries: read["adEnquiries"] ?? null, postsPublished: read["postsPublished"] ?? null, postsPlanned: read["postsPlanned"] ?? null }
      : { ...BLANK, keywordsPageOne: read["keywordsPageOne"] ?? null, keywordsPageOnePrev: read["keywordsPageOnePrev"] ?? null };
  return { success: true, data: { service, month: `${month}-01`, figures } };
}
