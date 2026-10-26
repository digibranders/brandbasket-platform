import { ACTIVITY_SERVICES, type ActivityService } from "@brandbasket/db";

export const UPDATE_SERVICE_OPTIONS: readonly { readonly value: "" | ActivityService; readonly label: string }[] = [
  { value: "", label: "General" },
  { value: "website", label: "Website" },
  { value: "social", label: "Social & Ads" },
  { value: "search", label: "Search" },
];

export type UpdateParse =
  | { readonly success: true; readonly data: { readonly service: ActivityService | null; readonly title: string; readonly occurredOn: string } }
  | { readonly success: false; readonly message: string };

const TITLE_MIN = 3;
const TITLE_MAX = 140;

/** Checks the "add an update" form. `todayIso` is today's date in India as YYYY-MM-DD. */
export function parseUpdateForm(input: { readonly service: string; readonly title: string; readonly date: string }, todayIso: string): UpdateParse {
  const title = input.title.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) return { success: false, message: `Write the update in ${TITLE_MIN} to ${TITLE_MAX} characters.` };
  if (input.service !== "" && !(ACTIVITY_SERVICES as readonly string[]).includes(input.service)) return { success: false, message: "Choose General, Website, Social & Ads or Search." };
  const date = input.date.trim() === "" ? todayIso : input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return { success: false, message: "Enter the date as day, month and year." };
  if (date > todayIso) return { success: false, message: "That date is in the future." };
  return { success: true, data: { service: input.service === "" ? null : (input.service as ActivityService), title, occurredOn: date } };
}

/** Midday in India on that date, so the line sits on the right day wherever it is read. */
export function occurredAtFor(date: string): Date {
  return new Date(`${date}T12:00:00+05:30`);
}
