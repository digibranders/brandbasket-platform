import { formatCalendarDate } from "@brandbasket/shared/lib/format";

/** Dates on the Services page are said in India time: the business and the team both work in it. */
const INDIA_TIME = "Asia/Kolkata";

/** A date as the page says it: "12 November 2026". */
export function addOnDate(date: Date): string {
  return formatCalendarDate(date, INDIA_TIME);
}

/** Said instead of an Add or Remove while a kept plan waits to start: the subscription it carries on from is cancelled at the provider. */
export function planStartsAgain(startsOn: Date): string {
  return `Your plan starts again on ${addOnDate(startsOn)}. You can change your services from then.`;
}

/** Where a service stands, as a word (never colour alone) and the tone the row draws it in. */
export interface AddOnStatus {
  readonly word: "On" | "Ending" | "Not added";
  readonly tone: "on" | "ending" | "off";
}

/** The word on a service's row: in the plan's payment, on its way out at the next billing date, or not added. */
export function addOnStatus(entry: { readonly kind: "available" } | { readonly kind: "included"; readonly endsOn: Date | null }): AddOnStatus {
  if (entry.kind === "available") return { word: "Not added", tone: "off" };
  return entry.endsOn === null ? { word: "On", tone: "on" } : { word: "Ending", tone: "ending" };
}
