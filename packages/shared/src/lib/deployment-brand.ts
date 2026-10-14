/**
 * The name this deployment's customer emails go out under. The customer app picks a brand from the host a request came
 * in on; the staff console has no customer host, so a server that serves one brand only (PLATFORM_BRAND=fynix, set on
 * the platform and the admin app alike) says it once, in its environment. Unset is Firstfold. Names match the platform's
 * brands (apps/platform/lib/brand.ts).
 */
export type DeploymentBrandId = "firstfold" | "fynix";

const BRAND_NAMES: Readonly<Record<DeploymentBrandId, string>> = { firstfold: "Firstfold", fynix: "Fynix Digital" };

/** The brand PLATFORM_BRAND names; Firstfold when it is unset or blank. Anything else is refused, so a typo cannot quietly send Firstfold's name from a Fynix server. */
export function deploymentBrandId(env: Readonly<Record<string, string | undefined>> = process.env): DeploymentBrandId {
  const value = env.PLATFORM_BRAND?.trim().toLowerCase() ?? "";
  if (value === "") return "firstfold";
  if (value === "firstfold" || value === "fynix") return value;
  throw new Error(`PLATFORM_BRAND must be "firstfold" or "fynix", received "${value}"`);
}

/** The name emails call the product: "Firstfold", or "Fynix Digital" on a Fynix server. */
export function deploymentBrandName(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return BRAND_NAMES[deploymentBrandId(env)];
}

/** The short form of the name, for a line of text that has the product's name in front of something: "Firstfold", or "Fynix" on a Fynix server. */
export function deploymentBrandShortName(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return deploymentBrandId(env) === "fynix" ? "Fynix" : "Firstfold";
}

/**
 * The brand this process is, for module-level values that have no request or environment passed in (the registered
 * business's contact details, the site's name): NEXT_PUBLIC_PLATFORM_BRAND, which each app's next.config.ts fills from
 * PLATFORM_BRAND at build time so the browser's bundle agrees with the server, else PLATFORM_BRAND itself (a script, a
 * test). Both references stay literal so Next can inline the first.
 */
export function ambientBrandId(): DeploymentBrandId {
  return deploymentBrandId({ PLATFORM_BRAND: process.env.NEXT_PUBLIC_PLATFORM_BRAND || process.env.PLATFORM_BRAND });
}

/**
 * The name for a component that has no brand handed to it and runs in the browser too (an error screen, the account bar):
 * the deployment's (see ambientBrandId).
 */
export function clientBrandName(): string {
  return BRAND_NAMES[ambientBrandId()];
}

/** The short name of the brand this process is (see ambientBrandId): "Firstfold", or "Fynix" on a Fynix deployment. */
export function ambientBrandShortName(): string {
  return ambientBrandId() === "fynix" ? "Fynix" : "Firstfold";
}
