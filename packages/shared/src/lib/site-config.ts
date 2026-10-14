import { z } from "zod";
import { ambientBrandId, deploymentBrandId, type DeploymentBrandId } from "./deployment-brand";
import { planPriceInBoth } from "./pricing";

/** Both URLs end up in hrefs, so nothing but http(s) may reach them. */
const HTTP_PROTOCOL = /^https?$/;

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z
    .url("NEXT_PUBLIC_SITE_URL must be an absolute URL, such as https://example.com")
    .optional(),
  NEXT_PUBLIC_CONTACT_EMAIL: z
    .email("NEXT_PUBLIC_CONTACT_EMAIL must be a valid email address")
    .optional(),
  NEXT_PUBLIC_APP_URL: z
    .url({ protocol: HTTP_PROTOCOL, error: "NEXT_PUBLIC_APP_URL must be an absolute http:// or https:// URL" })
    .optional(),
  NEXT_PUBLIC_CALENDLY_URL: z
    .url({ protocol: HTTP_PROTOCOL, error: "NEXT_PUBLIC_CALENDLY_URL must be an absolute http:// or https:// URL" })
    .optional(),
});

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Each variable is referenced directly so Next.js can inline NEXT_PUBLIC_ values at build time.
const parsedEnv = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_SITE_URL),
  NEXT_PUBLIC_CONTACT_EMAIL: emptyToUndefined(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  NEXT_PUBLIC_APP_URL: emptyToUndefined(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_CALENDLY_URL: emptyToUndefined(process.env.NEXT_PUBLIC_CALENDLY_URL),
});

if (!parsedEnv.success) {
  throw new Error(`Invalid public environment configuration:\n${z.prettifyError(parsedEnv.error)}`);
}

export interface SiteConfig {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  /**
   * Where visitors write to us, and the security contact. NEXT_PUBLIC_CONTACT_EMAIL when set, otherwise the
   * registered business email, so the site always shows one.
   */
  readonly email: string;
  /** Where customers sign in. */
  readonly appUrl: string;
  /** Booking page shown after the Get started form. Null hides the embed. */
  readonly calendlyUrl: string | null;
}


/**
 * Registered business facts. Static, not environment-driven: these identify the legal entity, and they are printed as
 * the supplier on every tax invoice.
 */
export interface BusinessDetails {
  /** The company that supplies the service and holds the GSTIN. */
  readonly legalName: string;
  /** The name customers know. Printed under the legal name: "Trading as Firstfold". */
  readonly tradeName: string;
  /** Corporate Identity Number, from the certificate of incorporation. */
  readonly cin: string;
  /** Registered office, one line per entry. */
  readonly address: readonly string[];
  /**
   * Platform state code (lower case, "mh") of the registered office. Decides CGST and SGST against IGST, and must be
   * the state the GSTIN is registered in (site-config.test.ts holds the two together).
   */
  readonly stateCode: string;
  readonly gstNumber: string;
  /** Display form, e.g. "+91 789 789 6607". */
  readonly phone: string;
  /** tel: form, digits and a leading plus only. */
  readonly phoneHref: string;
  readonly email: string;
  readonly website: string;
}

const REGISTERED: BusinessDetails = {
  legalName: "Digibranders Private Limited",
  tradeName: "Firstfold",
  cin: "U72900MH2021PTC372344",
  address: [
    "Office No. 2617, 26th Floor, Solus Building,",
    "Hiranandani Estate, Ghodbunder Road,",
    "Thane West, Maharashtra 400607, India",
  ],
  stateCode: "mh",
  gstNumber: "27AAICD9268J1Z0",
  phone: "+91 789 789 6607",
  phoneHref: "+917897896607",
  email: "support@firstfold.io",
  website: "https://firstfold.io",
};

/**
 * The registered business with the name it trades under in `brand`: Digibranders is the company that supplies the service
 * and holds the GSTIN whichever brand it is sold under, but Fynix's invoices and pages say "Fynix Digital" and give Fynix's
 * own contact address and site.
 */
function detailsFor(brand: DeploymentBrandId): BusinessDetails {
  if (brand !== "fynix") return REGISTERED;
  return { ...REGISTERED, tradeName: "Fynix Digital", email: "hello@fynix.digital", website: "https://fynix.digital" };
}

/**
 * The registered business as this deployment trades (PLATFORM_BRAND, see ambientBrandId): Firstfold's own details unless
 * the deployment is Fynix's. Fixed when the module loads, in the server and the browser alike.
 */
export const businessDetails: BusinessDetails = detailsFor(ambientBrandId());

/** The same for an explicit environment (an invoice issued for a named deployment, a test). */
export function deploymentBusinessDetails(env: Readonly<Record<string, string | undefined>> = process.env): BusinessDetails {
  return detailsFor(deploymentBrandId(env));
}

export const siteConfig: SiteConfig = {
  name: businessDetails.tradeName,
  description: `Rent a professional B2B website without the upfront cost. Design, hosting and ongoing care from ${planPriceInBoth("monthly")} a month.`,
  url: parsedEnv.data.NEXT_PUBLIC_SITE_URL ?? (ambientBrandId() === "fynix" ? businessDetails.website : "http://localhost:3000"),
  email: parsedEnv.data.NEXT_PUBLIC_CONTACT_EMAIL ?? businessDetails.email,
  appUrl: parsedEnv.data.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3001",
  calendlyUrl: parsedEnv.data.NEXT_PUBLIC_CALENDLY_URL ?? null,
};

/** Who the customer meets on the booking call. */
export interface CallHost {
  readonly name: string;
  readonly role: string;
  /** A photo in /public, e.g. "/team/steve.jpg". Null falls back to the initials mark. */
  readonly photo: string | null;
  readonly minutes: number;
}

export const callHost: CallHost = {
  name: "Steve Jason",
  role: "Firstfold",
  photo: null,
  minutes: 30,
};
