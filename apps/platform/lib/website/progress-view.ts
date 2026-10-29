import type { ProjectStatus } from "@brandbasket/db";
import { addWorkingDays, shortDay } from "@/lib/call-dates";

export type ProgressKind = "setup" | "kickoff" | "building" | "paused" | "preview" | "revising" | "approved" | "live" | "none";

export interface ProgressInput {
  readonly status: ProjectStatus | null;
  /** The pause reason the customer reads, or null. */
  readonly holdReason: string | null;
  readonly roundsIncluded: number;
  readonly roundsGranted: number;
  /** Day the next preview is due, `YYYY-MM-DD`, or null. */
  readonly previewDue: string | null;
  /** Day the site is promised live, `YYYY-MM-DD`, or null. */
  readonly liveBy: string | null;
  /** The customer answered the first questions, so the build starts after the kickoff call and there is no setup checklist to finish. */
  readonly kickoffFirst: boolean;
  /** Day of the booked kickoff call, `YYYY-MM-DD`, or null when none is booked. */
  readonly kickoffDay: string | null;
}

export interface ProgressView {
  readonly kind: ProgressKind;
  readonly title: string;
  readonly line: string | null;
}

const WORDS = ["no", "one", "two", "three", "four", "five"] as const;

/** "Two rounds of changes are included." or, after them, "Further changes are quoted first." */
export function roundsLine(included: number, granted: number): string {
  const left = Math.max(0, included - granted);
  if (left === 0) return "Further changes are quoted first.";
  const word = WORDS[left] ?? String(left);
  const first = `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  return left === 1 ? `${first} round of changes is included.` : `${first} rounds of changes are included.`;
}

export function progressView(input: ProgressInput): ProgressView {
  const due = input.previewDue === null ? null : shortDay(input.previewDue);
  const live = input.liveBy === null ? null : shortDay(input.liveBy);
  switch (input.status) {
    case null:
    case "cancelled":
      return { kind: "none", title: "Nothing is being built right now", line: null };
    case "onboarding":
      if (input.kickoffFirst) {
        return {
          kind: "kickoff",
          title: "We start after your kickoff call",
          line: input.kickoffDay === null ? "Book your call and we start building straight after it." : `Your call is on ${shortDay(input.kickoffDay)}. We start building straight after it.`,
        };
      }
      return { kind: "setup", title: "Finish your setup", line: "We start building once your setup is in." };
    case "submitted":
    case "building":
      return { kind: "building", title: "We are building your website", line: due === null ? null : `Your first preview will be ready by ${due}.` };
    case "on_hold":
      return { kind: "paused", title: "Your build is paused", line: input.holdReason ?? "We will be in touch about what we need from you." };
    case "preview":
      return {
        kind: "preview",
        title: "Your preview is ready",
        line: "Look through it on your phone and on a computer. Then approve it, or tell us what to change.",
      };
    case "revisions":
      return { kind: "revising", title: "We are making your changes", line: due === null ? null : `Your updated preview will be ready by ${due}.` };
    case "approved":
      return { kind: "approved", title: "You approved the preview", line: live === null ? "We are putting your website live." : `We are putting your website live. It should be up by ${live}.` };
    case "live":
      return { kind: "live", title: "Your website is live", line: null };
  }
}

/** Two working days after the day a revision was asked for: where the page gets its "updated preview" date. */
export function revisionDue(askedDay: string): string {
  return addWorkingDays(askedDay, 2);
}
