/** What pressing Reactivate on Billing came to, when it did not leave the page for the payment. */
export type ReactivateFormState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialReactivateFormState: ReactivateFormState = { status: "idle" };
