/*
 * The name the product's emails go out under, and who they come from. The apps pass `brandName` to a template when they
 * have one; everything else (a staff-sent email, a job, a fallback) uses these defaults.
 */
export interface EmailAddress {
  readonly email: string;
  readonly name: string;
}

const BRAND_NAME = "Fynix Digital";

/** The name emails call the product: "Fynix Digital". */
export function emailBrandName(): string {
  return BRAND_NAME;
}

/** Who mail comes from, and where replies go, when the environment names no one. */
export function emailSenderDefaults(): { readonly from: EmailAddress; readonly replyTo: EmailAddress } {
  return {
    from: { email: "no-reply@fynix.digital", name: "Fynix Digital" },
    replyTo: { email: "hello@fynix.digital", name: "Fynix Support" },
  };
}

/** Where team alerts go when the environment names no inbox: the product's own support address. */
export function emailTeamInboxDefault(): string {
  return "hello@fynix.digital";
}
