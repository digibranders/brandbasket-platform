/*
 * The brand a deployment's emails go out under. The apps pass `brandName` to the templates when a request tells them which
 * brand the reader is on; everything else (a staff-sent email, a job, a fallback) says it once, in the environment:
 * PLATFORM_BRAND=fynix on a server that serves Fynix only. Unset is Firstfold. Mirrors packages/shared deployment-brand.ts,
 * which this package cannot import.
 */
export type EmailBrandId = "firstfold" | "fynix";

type Env = Readonly<Record<string, string | undefined>>;

const BRAND_NAMES: Readonly<Record<EmailBrandId, string>> = { firstfold: "Firstfold", fynix: "Fynix Digital" };

/** The brand PLATFORM_BRAND names; Firstfold when unset or blank. Anything else is refused rather than guessed. */
export function emailBrandId(env: Env = process.env): EmailBrandId {
  const value = env.PLATFORM_BRAND?.trim().toLowerCase() ?? "";
  if (value === "") return "firstfold";
  if (value === "firstfold" || value === "fynix") return value;
  throw new Error(`PLATFORM_BRAND must be "firstfold" or "fynix", received "${value}"`);
}

/** The name emails call the product: "Firstfold", or "Fynix Digital" on a Fynix server. */
export function emailBrandName(env: Env = process.env): string {
  return BRAND_NAMES[emailBrandId(env)];
}

export interface EmailAddress {
  readonly email: string;
  readonly name: string;
}

/** Who mail comes from, and where replies go, when the environment names no one: the deployment's own brand. */
export function emailSenderDefaults(brand: EmailBrandId): { readonly from: EmailAddress; readonly replyTo: EmailAddress } {
  if (brand === "fynix") {
    return {
      from: { email: "no-reply@fynix.digital", name: "Fynix Digital" },
      replyTo: { email: "hello@fynix.digital", name: "Fynix Support" },
    };
  }
  return {
    from: { email: "alerts@firstfold.io", name: "Firstfold Alerts" },
    replyTo: { email: "support@firstfold.io", name: "Firstfold Support" },
  };
}

/** Where team alerts go when the environment names no inbox: the brand's own support address. */
export function emailTeamInboxDefault(brand: EmailBrandId): string {
  return brand === "fynix" ? "hello@fynix.digital" : "support@firstfold.io";
}
