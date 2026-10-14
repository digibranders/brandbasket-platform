/**
 * GST's two-digit state codes (the first two characters of every GSTIN and the "Place of supply" code on an invoice),
 * keyed by the ISO 3166-2:IN code the rest of the platform uses (packages/db/src/india-states.ts). Daman and Diu merged
 * into Dadra and Nagar Haveli in 2020 and took code 26; 25 is retired. Pure and browser-safe.
 */

// A Map, not a plain object, so a name like "constructor" or "__proto__" is simply not found.
const GST_CODE_BY_STATE: ReadonlyMap<string, string> = new Map([
  ["jk", "01"], ["hp", "02"], ["pb", "03"], ["ch", "04"], ["uk", "05"], ["hr", "06"], ["dl", "07"], ["rj", "08"],
  ["up", "09"], ["br", "10"], ["sk", "11"], ["ar", "12"], ["nl", "13"], ["mn", "14"], ["mz", "15"], ["tr", "16"],
  ["ml", "17"], ["as", "18"], ["wb", "19"], ["jh", "20"], ["od", "21"], ["cg", "22"], ["mp", "23"], ["gj", "24"],
  ["dh", "26"], ["mh", "27"], ["ka", "29"], ["ga", "30"], ["ld", "31"], ["kl", "32"], ["tn", "33"], ["py", "34"],
  ["an", "35"], ["tg", "36"], ["ap", "37"], ["la", "38"],
]);

const STATE_BY_GST_CODE: ReadonlyMap<string, string> = new Map(
  [...GST_CODE_BY_STATE].map(([state, gst]) => [gst, state]),
);

/** Thrown for a state code that is not an Indian state or union territory, so a typo never reaches an invoice. */
export class UnknownStateError extends Error {
  constructor(stateCode: string) {
    super(`No GST state code for state "${stateCode}"`);
    this.name = "UnknownStateError";
  }
}

/** "mh" -> "27". Throws for a code that is not an Indian state or union territory. */
export function gstStateCodeOf(stateCode: string): string {
  const gst = GST_CODE_BY_STATE.get(stateCode);
  if (gst === undefined) throw new UnknownStateError(stateCode);
  return gst;
}

/** "27" -> "mh", or null for a code that is not a state (96, 97 and anything unassigned). */
export function stateCodeOfGstCode(gstCode: string): string | null {
  return STATE_BY_GST_CODE.get(gstCode) ?? null;
}
