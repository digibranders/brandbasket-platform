/**
 * A deliverable's life, in the database's own words (migration 0193). No imports, so the customer pages, the console,
 * the schema and the tests all read one list. The arrows are exactly the ones the database's `deliverables_guard`
 * trigger allows: deliverables.integration.test.ts walks every pair for every kind against it.
 */

export const DELIVERABLE_KINDS = ["post", "page", "listing"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const DELIVERABLE_STATUSES = ["planned", "awaiting_approval", "approved", "published"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

/** A post belongs to Social & Ads; a page and a listing belong to Search. */
export type DeliverableService = "social" | "search";

export function serviceOfKind(kind: DeliverableKind): DeliverableService {
  return kind === "post" ? "social" : "search";
}

/**
 * Where a deliverable may go next. Only a post waits for the customer: `approved` is reached only through the
 * database function `approve_deliverables`, never by a staff update (staff have no right to the approval columns).
 */
export function canMoveDeliverable(kind: DeliverableKind, from: DeliverableStatus, to: DeliverableStatus): boolean {
  if (from === to) return true;
  if (kind !== "post") return from === "planned" && to === "published";
  switch (from) {
    case "planned":
      return to === "awaiting_approval";
    case "awaiting_approval":
      return to === "planned" || to === "approved";
    case "approved":
      return to === "published" || to === "awaiting_approval";
    case "published":
      return false;
  }
}

export function isDeliverableKind(value: unknown): value is DeliverableKind {
  return typeof value === "string" && (DELIVERABLE_KINDS as readonly string[]).includes(value);
}

export function isDeliverableStatus(value: unknown): value is DeliverableStatus {
  return typeof value === "string" && (DELIVERABLE_STATUSES as readonly string[]).includes(value);
}
