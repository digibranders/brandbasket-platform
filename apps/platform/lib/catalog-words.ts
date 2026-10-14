import type { RenamablePageTab } from "@fynix/shared/lib/directory/page-tabs";

/*
 * The words on a Services or Products form in the dashboard. While the owner keeps the usual name the forms talk about a
 * "service" or a "product"; once they have named the tab themselves ("Menu") the forms say "Add to Menu" and "Name", which
 * fit a dish or a medicine as well as a haircut. Browser-safe and pure.
 */

export interface CatalogWords {
  /** The tab as visitors read it: the owner's name for it, or the usual word. */
  readonly tabName: string;
  /** The heading over the form that adds one. */
  readonly addHeading: string;
  readonly addSubmit: string;
  readonly saveSubmit: string;
  /** The label on the field that holds the item's name. */
  readonly nameField: string;
  /** What one item is called in a sentence, lower case. */
  readonly one: string;
  /** What the form's items are called in a sentence, lower case. */
  readonly many: string;
}

const USUAL: Readonly<Record<RenamablePageTab, CatalogWords>> = {
  services: { tabName: "Services", addHeading: "Add a service", addSubmit: "Add service", saveSubmit: "Save service", nameField: "Service", one: "service", many: "services" },
  products: { tabName: "Products", addHeading: "Add a product", addSubmit: "Add product", saveSubmit: "Save product", nameField: "Product", one: "product", many: "products" },
};

/** The words for `tab`'s forms, given the name its owner chose for it (null: the usual one). */
export function catalogWords(tab: RenamablePageTab, label: string | null): CatalogWords {
  const usual = USUAL[tab];
  if (label === null) return usual;
  return { tabName: label, addHeading: `Add to ${label}`, addSubmit: "Add item", saveSubmit: "Save item", nameField: "Name", one: "item", many: "items" };
}
