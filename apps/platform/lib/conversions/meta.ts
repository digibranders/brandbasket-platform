import { createHash } from "node:crypto";

/** Meta matches on the SHA-256 of the trimmed, lower-case text. */
export function sha256Lower(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

export interface MetaPurchaseInput {
  /** The provider's payment id: the same id on the browser event (if there ever is one) lets Meta count one sale. */
  readonly eventId: string;
  readonly paidAt: Date;
  readonly sourceUrl: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly fbp: string | null;
  readonly fbc: string | null;
  readonly valueCents: number;
  readonly currency: "INR" | "USD";
}

export interface MetaBody {
  readonly data: readonly [
    {
      readonly event_name: "Purchase";
      readonly event_time: number;
      readonly event_id: string;
      readonly action_source: "website";
      readonly event_source_url: string;
      readonly user_data: Readonly<Record<string, unknown>>;
      readonly custom_data: { readonly currency: "INR" | "USD"; readonly value: number };
    },
  ];
}

/** The Conversions API body for a first payment (plan 59): hashed email and phone (digits with the country code), the browser ids as they are. Pure. */
export function buildMetaPurchase(input: MetaPurchaseInput): MetaBody {
  const user: Record<string, unknown> = {};
  if (input.email) user.em = [sha256Lower(input.email)];
  const digits = input.phone?.replace(/\D/g, "") ?? "";
  if (digits !== "") user.ph = [sha256Lower(digits)];
  if (input.fbp) user.fbp = input.fbp;
  if (input.fbc) user.fbc = input.fbc;
  return {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(input.paidAt.getTime() / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.sourceUrl,
        user_data: user,
        custom_data: { currency: input.currency, value: input.valueCents / 100 },
      },
    ],
  };
}
