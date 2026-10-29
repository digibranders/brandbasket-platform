import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";

/** The services in the catalogue's order, with the ones the customer already has first and the ones they could add after. Within each group the catalogue's order is kept. */
export function ownedFirst<Entry extends { readonly addOn: MonthlyAddOnId; readonly kind: "included" | "available" }>(
  catalogue: readonly { readonly id: MonthlyAddOnId }[],
  entries: readonly Entry[],
): readonly Entry[] {
  const entryOf = new Map(entries.map((entry) => [entry.addOn, entry] as const));
  const ordered = catalogue.flatMap((addOn) => {
    const entry = entryOf.get(addOn.id);
    return entry === undefined ? [] : [entry];
  });
  return [...ordered.filter((entry) => entry.kind === "included"), ...ordered.filter((entry) => entry.kind !== "included")];
}
