import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { BRAND_TIME_ZONE, promiseDates, shortDay } from "@/lib/call-dates";

export interface FirstLookStep {
  readonly title: string;
  readonly note: string;
  /** The date, or "" when it is not known yet. */
  readonly when: string;
  readonly state: "done" | "now" | "later";
}

/** The rows of What happens next. Dates appear once the call has a time. */
export function firstLookSteps(input: {
  readonly hasWebsite: boolean;
  readonly callStartIso: string | null;
  readonly booked: boolean;
  /** Staff have marked the call held: it is said as done, not as booked. */
  readonly held?: boolean | undefined;
}): readonly FirstLookStep[] {
  const dates = input.callStartIso === null ? null : promiseDates(input.callStartIso);
  const callDay = input.callStartIso === null ? "" : shortDay(dayKey(input.callStartIso, BRAND_TIME_ZONE));
  const call: FirstLookStep = input.held === true
    ? { title: "Kickoff call", note: "Done", when: callDay, state: "done" }
    : input.booked
    ? { title: "Kickoff call booked", note: "30 minutes, video", when: callDay, state: "done" }
    : { title: "Kickoff call", note: "The time you pick", when: "", state: "now" };
  const startWhen = dates === null ? "" : `By ${shortDay(dates.startBy)}`;
  if (!input.hasWebsite) return [call, { title: "We start work", note: "Within 48 hours of the call", when: startWhen, state: "later" }];
  return [
    call,
    { title: "We start building", note: "Within 48 hours of the call", when: startWhen, state: "later" },
    { title: "You check the preview", note: "Approve it or ask for changes", when: "", state: "later" },
    { title: "Your website is live", note: "Within 7 working days of the call", when: dates === null ? "" : `By ${shortDay(dates.liveBy)}`, state: "later" },
  ];
}
