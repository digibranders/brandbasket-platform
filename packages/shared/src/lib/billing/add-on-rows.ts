import type { AddOnEndKind, AddOnFacts, AddOnSubscriptionStatus } from "./add-on-state";

/**
 * Which of a business's rows for one add-on say what it is doing now. Pure and browser-safe, so the customer's Add-ons
 * page, the checkout and the staff client page all read the rows the same way.
 */

/** What picking a row needs: an id, its status, and whether it was ever paid. */
export interface PickableAddOnRow {
  readonly id: string;
  readonly status: AddOnSubscriptionStatus;
  readonly activatedAt: Date | null;
}

/** The columns of a stored add-on row that addOnView reads. `endKind` is plain text in the database. */
export interface StoredAddOnFacts extends Omit<AddOnFacts, "endKind"> {
  readonly endKind: string | null;
}

/** A stored row as the rules read it. An end kind that is neither "cancel" nor "pause" is corrupt data and throws. */
export function addOnFactsOf(row: StoredAddOnFacts): AddOnFacts {
  if (row.endKind !== null && row.endKind !== "cancel" && row.endKind !== "pause") {
    throw new RangeError(`Unknown add-on end kind ${row.endKind}`);
  }
  const endKind: AddOnEndKind | null = row.endKind;
  return {
    status: row.status,
    endKind,
    currentPeriodEnd: row.currentPeriodEnd,
    haltedAt: row.haltedAt,
    endedAt: row.endedAt,
    startAt: row.startAt,
  };
}

export interface PickedAddOnRows<T extends PickableAddOnRow> {
  /** The unpaid checkout, if there is one. The database allows at most one. */
  readonly incomplete: T | null;
  /** The newest row that says what the add-on is doing: not an unpaid checkout, and not an abandoned one. */
  readonly current: T | null;
  /** A kept subscription waiting for its start date, or null. */
  readonly successor: T | null;
}

/**
 * A row cancelled before it was ever paid never ran: a checkout that was replaced or timed out, or a kept subscription
 * that was undone before its first charge. It says nothing about the add-on, so it must not hide the row beneath it
 * (a paused add-on would otherwise look ended after one abandoned Resume).
 */
function isAbandoned(row: PickableAddOnRow): boolean {
  return row.status === "cancelled" && row.activatedAt === null;
}

/** `rowsNewestFirst` is one business's rows for one add-on, newest first, as listAddOnSubscriptionsForBusiness returns them. */
export function pickAddOnRows<T extends PickableAddOnRow>(rowsNewestFirst: readonly T[]): PickedAddOnRows<T> {
  return {
    incomplete: rowsNewestFirst.find((row) => row.status === "incomplete") ?? null,
    current: rowsNewestFirst.find((row) => row.status !== "incomplete" && !isAbandoned(row)) ?? null,
    successor: rowsNewestFirst.find((row) => row.status === "scheduled") ?? null,
  };
}
