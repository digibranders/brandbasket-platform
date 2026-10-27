/*
 * The name the product's emails go out under, and who they come from. The apps pass `brandName` to a template when they
 * have one; everything else (a staff-sent email, a job, a fallback) uses these defaults.
 */
export interface EmailAddress {
  readonly email: string;
  readonly name: string;
}

const BRAND_NAME = "Brandbasket";

/** The name emails call the product: "Brandbasket". */
export function emailBrandName(): string {
  return BRAND_NAME;
}

/** Who mail comes from, and where replies go, when the environment names no one. */
export function emailSenderDefaults(): { readonly from: EmailAddress; readonly replyTo: EmailAddress } {
  return {
    from: { email: "no-reply@brandbasket.in", name: "Brandbasket" },
    replyTo: { email: "support@brandbasket.in", name: "Brandbasket Support" },
  };
}

/** Where team alerts go when the environment names no inbox: the product's own support address. */
export function emailTeamInboxDefault(): string {
  return "support@brandbasket.in";
}

/**
 * Where the logo in the customer emails is served from: a 360px wide PNG for a white background (mail apps do not show SVG),
 * which the dashboard serves at /email/email-logo.png.
 */
export function emailLogoUrl(): string {
  return "https://app.brandbasket.in/email/email-logo.png";
}
