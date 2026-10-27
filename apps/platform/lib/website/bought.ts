import { addOnById, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { dayMonth } from "@/lib/call-dates";

/** A bundled service line as stored (bundled_add_ons), as much of it as the Progress page needs. */
export interface BoughtLine {
  readonly addOn: string;
  readonly status: string;
  readonly activatedAt: Date | null;
  readonly endRequestedAt: Date | null;
}

export interface BoughtRow {
  readonly key: MonthlyAddOnId;
  readonly name: string;
  /** The date or the state that goes with it: "Since 27 Oct". */
  readonly note: string;
}

/** What the plan pays for, one row a service in the catalogue's order, from the lines already stored: no price or date is made up here. */
export function boughtRows(lines: readonly BoughtLine[]): readonly BoughtRow[] {
  return MONTHLY_ADD_ON_IDS.flatMap((id): BoughtRow[] => {
    const own = lines.find((candidate) => isMonthlyAddOnId(candidate.addOn) && candidate.addOn === id && (candidate.status === "active" || candidate.status === "pending"));
    if (own === undefined) return [];
    const note =
      own.endRequestedAt !== null ? "Ends at your next bill" : own.status === "active" && own.activatedAt !== null ? `Since ${dayMonth(own.activatedAt)}` : "Starts with your first payment";
    return [{ key: id, name: addOnById(id).title, note }];
  });
}
