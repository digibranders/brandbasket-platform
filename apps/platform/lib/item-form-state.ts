/**
 * What a Business profile form that saves one thing (a service, a product, the contact options, the trust details)
 * hands back to its page when it does not redirect: nothing yet, or what went wrong. A save that works redirects to the
 * tab with a notice instead. Browser-safe.
 */
export type ItemFormState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialItemFormState: ItemFormState = { status: "idle" };
