import type { BillingDetailsField } from "@fynix/shared/lib/billing/billing-details-form";

/**
 * What the staff billing details form's action hands back: nothing yet, a save, or one refusal with what was typed, as
 * the console's other forms do. Type-only import: the parser behind it is server code.
 */
export type StaffBillingDetailsState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | {
      readonly status: "error";
      readonly field: BillingDetailsField;
      readonly message: string;
      readonly values: Readonly<Record<string, string>>;
    };

export const INITIAL_STAFF_BILLING_DETAILS_STATE: StaffBillingDetailsState = { status: "idle" };
