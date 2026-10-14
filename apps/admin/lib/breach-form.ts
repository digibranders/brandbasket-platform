import type { BreachProgress, NewBreach } from "@fynix/db";

/** The kinds of data a breach can involve, a fixed list so the register can be counted and a report filled in the same words. */
export const BREACH_DATA_CATEGORIES = [
  "contact details",
  "account sign-in details",
  "billing details",
  "health information",
  "directory activity",
  "other",
] as const;

const SUMMARY_MAX_LENGTH = 2000;

const SUMMARY_MISSING = "Say what happened, in a few words.";
const SUMMARY_TOO_LONG = `Keep the summary to ${SUMMARY_MAX_LENGTH} characters.`;
const TIME_MISSING = "Enter when the breach was found.";
const TIME_IN_FUTURE = "A breach cannot have been found in the future.";

/** Everything the form can say is wrong, so the page can show one passed back in the address and nothing else. */
export const BREACH_FORM_MESSAGES: readonly string[] = [SUMMARY_MISSING, SUMMARY_TOO_LONG, TIME_MISSING, TIME_IN_FUTURE];
/** India's offset: the staff who log a breach read their own clocks. */
const IST_OFFSET = "+05:30";

type Parsed<T> = { readonly ok: true; readonly input: T } | { readonly ok: false; readonly message: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** What a "Log a breach" form says, checked, or the one thing to put right. The person logging it is added by the action. */
export function parseBreachForm(formData: FormData, now: Date): Parsed<Omit<NewBreach, "recordedBy">> {
  const summary = text(formData, "summary").trim();
  if (summary === "") return { ok: false, message: SUMMARY_MISSING };
  if (summary.length > SUMMARY_MAX_LENGTH) return { ok: false, message: SUMMARY_TOO_LONG };

  const raw = text(formData, "detectedAt").trim();
  const detectedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? new Date(`${raw}:00${IST_OFFSET}`) : null;
  if (detectedAt === null || Number.isNaN(detectedAt.getTime())) return { ok: false, message: TIME_MISSING };
  if (detectedAt.getTime() > now.getTime()) return { ok: false, message: TIME_IN_FUTURE };

  const known: readonly string[] = BREACH_DATA_CATEGORIES;
  const dataCategories = formData.getAll("category").filter((value): value is string => typeof value === "string" && known.includes(value));
  return { ok: true, input: { summary, detectedAt, dataCategories: [...new Set(dataCategories)] } };
}

/** The button pressed on a breach, as the progress it records; a report is stamped with the time it was pressed. */
export function parseBreachProgress(formData: FormData, now: Date): { readonly ok: true; readonly progress: BreachProgress } | { readonly ok: false } {
  switch (text(formData, "do")) {
    case "cert_in":
      return { ok: true, progress: { reportedCertInAt: now } };
    case "board":
      return { ok: true, progress: { reportedBoardAt: now } };
    case "people":
      return { ok: true, progress: { peopleNotifiedAt: now } };
    case "contained":
      return { ok: true, progress: { status: "contained" } };
    case "closed":
      return { ok: true, progress: { status: "closed" } };
    default:
      return { ok: false };
  }
}
