import type { PaymentLinkField } from "@/lib/payment-link-form";

/** What the create form's action hands back. A made link is shown here, once, because only its hash is kept. */
export type PaymentLinkFormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly field: PaymentLinkField | null;
      readonly values: Readonly<Record<string, string | readonly string[]>>;
    }
  | {
      readonly status: "created";
      /** The address to send: the customer app's origin, /pay/ and the token. Never shown again. */
      readonly address: string;
      /** Whom it is for, as the list names them. */
      readonly customer: string;
      readonly expiresAt: string;
    };

export const initialPaymentLinkFormState: PaymentLinkFormState = { status: "idle" };
