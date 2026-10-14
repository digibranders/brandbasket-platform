/*
 * India's states and union territories by their ISO 3166-2:IN code, lower-cased: the second segment of every
 * directory URL (/in/mh/..., /in/wb/...). Codes follow the 2023 ISO update (od, tg, cg, uk, dh). The implementation
 * lives in @firstfold/db (shared depends on db, so db cannot import it from here); @firstfold/shared re-exports it. The
 * website keeps a copy (website-listing lib/india-states.ts); the two test files hold the same vectors so the copies
 * stay in step. Pure and browser-safe.
 */

export interface IndiaState {
  readonly code: string;
  readonly name: string;
  /** Other spellings India Post's directory uses, upper-cased and normalised as `normaliseName` does. */
  readonly aliases?: readonly string[];
}

export const INDIA_STATES: readonly IndiaState[] = [
  { code: "an", name: "Andaman and Nicobar Islands" },
  { code: "ap", name: "Andhra Pradesh" },
  { code: "ar", name: "Arunachal Pradesh" },
  { code: "as", name: "Assam" },
  { code: "br", name: "Bihar" },
  { code: "ch", name: "Chandigarh" },
  { code: "cg", name: "Chhattisgarh", aliases: ["CHATTISGARH"] },
  {
    code: "dh",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    aliases: ["THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "DADRA AND NAGAR HAVELI", "DAMAN AND DIU"],
  },
  { code: "dl", name: "Delhi", aliases: ["NCT OF DELHI"] },
  { code: "ga", name: "Goa" },
  { code: "gj", name: "Gujarat" },
  { code: "hr", name: "Haryana" },
  { code: "hp", name: "Himachal Pradesh" },
  { code: "jk", name: "Jammu and Kashmir" },
  { code: "jh", name: "Jharkhand" },
  { code: "ka", name: "Karnataka" },
  { code: "kl", name: "Kerala" },
  { code: "la", name: "Ladakh" },
  { code: "ld", name: "Lakshadweep" },
  { code: "mp", name: "Madhya Pradesh" },
  { code: "mh", name: "Maharashtra" },
  { code: "mn", name: "Manipur" },
  { code: "ml", name: "Meghalaya" },
  { code: "mz", name: "Mizoram" },
  { code: "nl", name: "Nagaland" },
  { code: "od", name: "Odisha", aliases: ["ORISSA"] },
  { code: "py", name: "Puducherry", aliases: ["PONDICHERRY"] },
  { code: "pb", name: "Punjab" },
  { code: "rj", name: "Rajasthan" },
  { code: "sk", name: "Sikkim" },
  { code: "tn", name: "Tamil Nadu" },
  { code: "tg", name: "Telangana" },
  { code: "tr", name: "Tripura" },
  { code: "up", name: "Uttar Pradesh" },
  { code: "uk", name: "Uttarakhand", aliases: ["UTTARANCHAL"] },
  { code: "wb", name: "West Bengal" },
];

/** "  Andaman & Nicobar  islands " -> "ANDAMAN AND NICOBAR ISLANDS". */
function normaliseName(name: string): string {
  return name.replace(/&/g, " and ").replace(/\s+/g, " ").trim().toUpperCase();
}

const byName = new Map<string, string>();
for (const state of INDIA_STATES) {
  byName.set(normaliseName(state.name), state.code);
  for (const alias of state.aliases ?? []) byName.set(normaliseName(alias), state.code);
}
const byCode = new Map(INDIA_STATES.map((state) => [state.code, state]));

/** The state code for a state name as India Post's directory writes it, or null for a name it does not know. */
export function stateCodeOfIndiaPostName(name: string): string | null {
  return byName.get(normaliseName(name)) ?? null;
}

export function isIndiaStateCode(code: string): boolean {
  return byCode.has(code);
}

export function stateName(code: string): string | null {
  return byCode.get(code)?.name ?? null;
}
