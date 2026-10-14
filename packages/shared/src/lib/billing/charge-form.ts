import { parseMoney } from "../money";
import { isStaffChargeKind, type StaffChargeKind } from "./charges";

export const CHARGE_KIND_FIELD = "kind";
export const CHARGE_QUANTITY_FIELD = "quantity";
export const CHARGE_DESCRIPTION_FIELD = "description";
export const CHARGE_PRICE_FIELD = "price";

/** Longest description a charge may have: the database's own limit. */
export const MAX_CHARGE_DESCRIPTION_LENGTH = 200;
/** More than this many units in one charge is a typo, not a real order. */
export const MAX_CHARGE_QUANTITY = 100;

/** What staff asked for. Prices come from the client's plan; only a custom charge carries its own. */
export interface ChargeRequest {
  readonly kind: StaffChargeKind;
  readonly quantity: number;
  /** Staff's own wording, or null to use the kind's default. Required for a custom charge. */
  readonly description: string | null;
  /** Net price of one unit in minor units: set for a custom charge, null otherwise. */
  readonly customUnitAmountCents: number | null;
}

export type ChargeFormProblem = "invalid-kind" | "invalid-quantity" | "missing-description" | "invalid-price";

export type ChargeForm = { readonly ok: true; readonly request: ChargeRequest } | { readonly ok: false; readonly problem: ChargeFormProblem };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * Reads the staff console's Add a charge form. A priced kind ignores any price posted with it, so a tampered form
 * can never undercut the plan; a custom charge must say what it is and give a positive price.
 */
export function parseChargeForm(formData: FormData): ChargeForm {
  const kind = text(formData.get(CHARGE_KIND_FIELD));
  if (!isStaffChargeKind(kind)) return { ok: false, problem: "invalid-kind" };

  const quantityText = text(formData.get(CHARGE_QUANTITY_FIELD));
  const quantity = /^[1-9][0-9]{0,2}$/.test(quantityText) ? Number(quantityText) : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity > MAX_CHARGE_QUANTITY) return { ok: false, problem: "invalid-quantity" };

  const description = text(formData.get(CHARGE_DESCRIPTION_FIELD));
  if (description.length > MAX_CHARGE_DESCRIPTION_LENGTH) return { ok: false, problem: "missing-description" };

  if (kind !== "custom") {
    return { ok: true, request: { kind, quantity, description: description === "" ? null : description, customUnitAmountCents: null } };
  }
  if (description === "") return { ok: false, problem: "missing-description" };
  const price = parseMoney(text(formData.get(CHARGE_PRICE_FIELD)));
  if (price === null || price < 1) return { ok: false, problem: "invalid-price" };
  return { ok: true, request: { kind, quantity, description, customUnitAmountCents: price } };
}
