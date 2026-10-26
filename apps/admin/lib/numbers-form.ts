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

/** A whole number from what staff typed, null when blank, undefined when it is not one. */
function whole(raw: string | undefined): number | null | undefined {
  const text = (raw ?? "").replace(/[₹,\s]/g, "");
  if (text === "") return null;
  return /^\d{1,9}$/.test(text) ? Number(text) : undefined;
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
