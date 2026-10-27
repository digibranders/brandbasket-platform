/**
 * A change request's life, in the database's own words (migration 0190). No imports, so the customer pages, the
 * console, the schema and the tests all read one list. The arrows in CHANGE_MOVES are exactly the ones the database's
 * `change_requests_guard` trigger allows: change-requests.integration.test.ts walks all 81 pairs against it.
 */

export const CHANGE_STATES = ["requested", "quoted", "in_progress", "preview", "revisions", "approved", "shipped", "declined", "withdrawn"] as const;
export type ChangeState = (typeof CHANGE_STATES)[number];

/** What a request is about. Website changes are the only ones that can use an included edit. */
export const CHANGE_KINDS = ["website", "social", "search", "billing", "other"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/**
 * Who pays for the work, decided by staff after the request is sent. `included` uses one of the month's included edits,
 * `free` is no charge and uses none (a billing fix, a goodwill change), `paid` has a quote.
 */
export const CHANGE_COVERAGES = ["undecided", "included", "free", "paid"] as const;
export type ChangeCoverage = (typeof CHANGE_COVERAGES)[number];

/** Where a request may go next. Staff moves, the customer's moves and a payment all follow these arrows. */
export const CHANGE_MOVES: Readonly<Record<ChangeState, readonly ChangeState[]>> = {
  requested: ["quoted", "in_progress", "declined", "withdrawn"],
  quoted: ["in_progress", "declined", "withdrawn"],
  in_progress: ["preview", "shipped", "declined"],
  preview: ["approved", "revisions", "shipped", "declined"],
  revisions: ["preview", "shipped", "declined"],
  approved: ["shipped", "revisions"],
  shipped: ["revisions"],
  declined: [],
  withdrawn: ["quoted"],
};

/** Staying where you are is not a move. */
export function canMoveChange(from: ChangeState, to: ChangeState): boolean {
  return from === to || CHANGE_MOVES[from].includes(to);
}

/** The work is over, one way or another: the ticket leaves the team's queue while a request is in one of these. */
export const ENDED_STATES = ["approved", "shipped", "declined", "withdrawn"] as const satisfies readonly ChangeState[];

export function isEnded(state: ChangeState): boolean {
  return (ENDED_STATES as readonly ChangeState[]).includes(state);
}

/** True for a value that is one of the states: narrows what a form or a query hands back. */
export function isChangeState(value: unknown): value is ChangeState {
  return typeof value === "string" && (CHANGE_STATES as readonly string[]).includes(value);
}

export function isChangeKind(value: unknown): value is ChangeKind {
  return typeof value === "string" && (CHANGE_KINDS as readonly string[]).includes(value);
}
