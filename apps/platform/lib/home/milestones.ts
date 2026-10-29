import type { Milestone } from "@/components/home/milestones";
import type { ClientHomeState } from "./state";

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * The website's path as five bars, for the states where a website is being built. Each word and date comes from a stored
 * fact (the call's end, the project's first-preview date), never a guess: a date that is not stored is left out.
 */
export function websiteMilestones(state: ClientHomeState, input: { readonly kickoffAt: Date | null; readonly firstPreviewDueAt: Date | null }): readonly Milestone[] {
  const day = (date: Date | null): string | null => (date === null ? null : DAY_FORMAT.format(date));
  // Which bar is "now": 1 building, 2 the customer's review, 3 changes, 4 live.
  const now = state.kind === "preview_ready" ? 2 : state.kind === "revisions" ? 3 : state.kind === "approved" ? 4 : state.kind === "launched" ? 5 : 1;
  const bar = (index: number): Milestone["state"] => (index < now ? "done" : index === now ? "now" : "next");
  return [
    { label: "Kickoff", state: "done", note: day(input.kickoffAt) },
    { label: "Building", state: state.kind === "on_hold" ? "now" : bar(1), note: state.kind === "on_hold" ? "Paused" : bar(1) === "now" ? (input.firstPreviewDueAt === null ? "Now" : `Preview by ${day(input.firstPreviewDueAt)}`) : null },
    { label: "Your review", state: bar(2), note: bar(2) === "now" ? "Now" : null },
    { label: "Changes", state: bar(3), note: bar(3) === "now" ? "Now" : bar(3) === "next" ? "If you need any" : null },
    { label: "Live", state: bar(4), note: bar(4) === "now" ? "Launch next" : null },
  ];
}
