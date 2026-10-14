import type { BillingProviderName } from "@fynix/db";

/** The providers this build can configure by name. Razorpay is accepted as a provider name but its adapter is not yet constructible (a later task finishes it). */
export const SUPPORTED_BILLING_PROVIDERS = ["fake", "razorpay"] as const satisfies readonly BillingProviderName[];
export type SupportedBillingProvider = (typeof SUPPORTED_BILLING_PROVIDERS)[number];

/** The environment variable that lets a real deployment run the fake provider anyway, set to exactly "1". */
export const ALLOW_FAKE_BILLING_VARIABLE = "FYNIX_ALLOW_FAKE_BILLING";

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export interface BillingEnvironment {
  readonly BILLING_PROVIDER?: string | undefined;
  readonly NODE_ENV?: string | undefined;
  /** Set by Vercel: "production", "preview" or "development". */
  readonly VERCEL_ENV?: string | undefined;
  /** The customer dashboard's origin. An https origin on a public host means real customers can reach it. */
  readonly APP_ORIGIN?: string | undefined;
  readonly FYNIX_ALLOW_FAKE_BILLING?: string | undefined;
}

function isSupported(value: string): value is SupportedBillingProvider {
  return (SUPPORTED_BILLING_PROVIDERS as readonly string[]).includes(value);
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]"
  );
}

/**
 * Whether this deployment can be reached by real customers: Vercel's production environment, or a dashboard served
 * over https from a host that is not this machine. A plain-http origin or a localhost one (the local verify server
 * on http://app.localhost:3101) is not real. An APP_ORIGIN that is set but cannot be read counts as real, so a typo
 * fails closed.
 */
export function isRealDeployment(env: BillingEnvironment): boolean {
  if (env.VERCEL_ENV === "production") return true;
  const origin = env.APP_ORIGIN?.trim() ?? "";
  if (origin === "") return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return true;
  }
  return url.protocol === "https:" && !isLocalHostname(url.hostname);
}

/**
 * Reads BILLING_PROVIDER. Outside production an unset value means the fake provider, so local development needs no
 * setup. In production an unset value is a configuration mistake and fails loudly: silently taking payments with
 * the fake provider would hand out dashboards for free.
 *
 * For the same reason the fake provider is refused on a real deployment (see isRealDeployment), however it was
 * chosen, unless FYNIX_ALLOW_FAKE_BILLING is exactly "1" (for a private preview that must simulate payments).
 */
export function resolveBillingProviderName(env: BillingEnvironment): SupportedBillingProvider {
  const raw = env.BILLING_PROVIDER?.trim() ?? "";
  let name: SupportedBillingProvider;
  if (raw === "") {
    if (env.NODE_ENV === "production") {
      throw new BillingConfigurationError(
        `BILLING_PROVIDER must be set in production. Accepted values: ${SUPPORTED_BILLING_PROVIDERS.join(", ")}.`,
      );
    }
    name = "fake";
  } else if (isSupported(raw)) {
    name = raw;
  } else {
    throw new BillingConfigurationError(
      `BILLING_PROVIDER "${raw}" is not supported. Accepted values: ${SUPPORTED_BILLING_PROVIDERS.join(", ")}.`,
    );
  }

  if (name === "fake" && isRealDeployment(env) && env.FYNIX_ALLOW_FAKE_BILLING !== "1") {
    throw new BillingConfigurationError(
      `The fake billing provider cannot run on a real deployment (VERCEL_ENV=production, or an https APP_ORIGIN that is not localhost): it hands out paid access without taking money. Configure a real provider, or set ${ALLOW_FAKE_BILLING_VARIABLE}=1 for a private test deployment.`,
    );
  }
  return name;
}
