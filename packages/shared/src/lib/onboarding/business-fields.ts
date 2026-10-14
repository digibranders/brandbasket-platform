/**
 * Step 01's weekday list, field names and parsed shape. Client components import this module; the parser in
 * business-form.ts pulls in the phone metadata, so the browser must never import that one.
 */
import type { OpeningHours } from "./hours";

export type { OpeningHours } from "./hours";

/** Index is the stored day_of_week: Monday is 0. */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The form field holding a day's choice: "unset", "open", "closed" or "all-day". */
export function dayModeField(dayOfWeek: number): string {
  return `hours.${dayOfWeek}.mode`;
}

export interface BusinessStepInput {
  readonly profile: {
    readonly displayName: string;
    readonly tagline: string | null;
    readonly description: string | null;
    /** E.164, e.g. "+919876543210". */
    readonly phone: string | null;
    readonly email: string | null;
    readonly addressLine1: string | null;
    readonly addressLine2: string | null;
    readonly city: string | null;
    readonly region: string | null;
    readonly postalCode: string | null;
    readonly country: string | null;
    readonly serviceAreas: string | null;
    readonly googleBusinessUrl: string | null;
  };
  readonly hours: readonly OpeningHours[];
}
