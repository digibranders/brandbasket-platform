import { deploymentBrandId } from "./deployment-brand";
import { runtimeRequirements, type RequirementsApp } from "./production-requirements";

/*
 * Checks a Fynix deployment's two environment files (the platform's and the console's) before the apps are started on them:
 * everything the apps themselves refuse to start without (production-requirements.ts), plus what only a pair of files can
 * get wrong (a secret that differs between them), and what the apps accept but a real deployment must not have (a bypass
 * switch, fake billing). Pure: the CLI is scripts/server/check-env.ts, which the deploy runs on the server. Messages name
 * settings, never print values.
 */

export type EnvValues = Readonly<Record<string, string | undefined>>;

export interface EnvCheck {
  /** Things that stop a deploy. */
  readonly errors: readonly string[];
  /** Things worth a look that do not. */
  readonly warnings: readonly string[];
}

/** A dotenv-style file: KEY=value lines; comments, blank lines, an `export` prefix and one pair of quotes are tolerated. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1] ?? "";
    let value = (match[2] ?? "").trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const MIN_SECRET_LENGTH = 32;
/** Never set where real customers can reach the app. */
const FORBIDDEN = ["EMAIL_CODE_BYPASS", "SIGNUP_OTP_BYPASS", "BOOKING_OTP_BYPASS", "VERIFY_OTP_BYPASS", "FIRSTFOLD_ALLOW_FAKE_BILLING"] as const;
const SHARED_EQUAL = ["BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_PAYLOAD"] as const;
const SECRETS: Readonly<Record<RequirementsApp, readonly string[]>> = {
  platform: ["BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "ACCOUNT_CODE_SECRET"],
  admin: ["BETTER_AUTH_SECRET", "PAYLOAD_SECRET"],
};
/** The database roles the code expects each connection to use (packages/db/src/roles.ts). */
const EXPECTED_ROLES: Readonly<Record<string, string>> = {
  DATABASE_URL: "firstfold_app",
  DATABASE_URL_STAFF: "firstfold_staff",
  DATABASE_URL_PUBLIC: "firstfold_public",
};

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";

function urlOf(value: string | undefined): URL | null {
  if (blank(value)) return null;
  try {
    return new URL(value ?? "");
  } catch {
    return null;
  }
}

function checkApp(app: RequirementsApp, env: EnvValues, errors: string[], warnings: string[]): void {
  if (deploymentBrandId({ PLATFORM_BRAND: env.PLATFORM_BRAND }) !== "fynix") errors.push(`${app}: PLATFORM_BRAND must be fynix for this product (found "${env.PLATFORM_BRAND ?? ""}").`);
  for (const name of runtimeRequirements(app, { PLATFORM_BRAND: "fynix" })) {
    if (blank(env[name])) errors.push(`${app}: ${name} is missing or blank.`);
  }
  for (const name of SECRETS[app]) {
    const value = env[name];
    if (!blank(value) && (value ?? "").length < MIN_SECRET_LENGTH) errors.push(`${app}: ${name} must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  for (const name of ["APP_ORIGIN", "ADMIN_ORIGIN"] as const) {
    const url = urlOf(env[name]);
    if (blank(env[name]) || url === null) continue;
    if (url.protocol !== "https:") errors.push(`${app}: ${name} must be an https:// address.`);
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "") errors.push(`${app}: ${name} must be an origin with no path.`);
  }
  for (const name of FORBIDDEN) {
    if (!blank(env[name])) errors.push(`${app}: ${name} must not be set on a real deployment.`);
  }
  if (env.BILLING_PROVIDER?.trim() !== "razorpay") errors.push(`${app}: BILLING_PROVIDER must be razorpay (found "${env.BILLING_PROVIDER ?? ""}").`);
  for (const name of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
    if (blank(env[name])) errors.push(`${app}: ${name} is missing or blank (BILLING_PROVIDER=razorpay).`);
  }
  if ((env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_")) warnings.push(`${app}: RAZORPAY_KEY_ID is a rzp_test_ key: payments are test payments until a rzp_live_ key is set.`);
  for (const name of ["DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC"]) {
    const url = urlOf(env[name]);
    const expected = EXPECTED_ROLES[name];
    if (url === null) continue;
    if (expected !== undefined && decodeURIComponent(url.username) !== expected) warnings.push(`${app}: ${name} connects as "${decodeURIComponent(url.username)}", not ${expected} (the role the code and its migrations grant for it).`);
  }
  for (const name of ["DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD"]) {
    const url = urlOf(env[name]);
    if (url !== null && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) warnings.push(`${app}: ${name} is not on this machine (${url.hostname}); the plan is Postgres on the droplet.`);
  }
  if (blank(env.FIRSTFOLD_MEDIA_ROOT)) warnings.push(`${app}: FIRSTFOLD_MEDIA_ROOT is unset, so uploads go to a folder inside the release and are lost at the next deploy. Set one absolute path, the same in both files.`);
}

/** Checks the platform's and the console's environments, as each file holds them. Either may be omitted to check one alone. */
export function checkProductionEnv(files: { readonly platform?: EnvValues; readonly admin?: EnvValues }): EnvCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { platform, admin } = files;
  if (platform !== undefined) {
    checkApp("platform", platform, errors, warnings);
    if (blank(platform.RAZORPAY_WEBHOOK_SECRET)) errors.push("platform: RAZORPAY_WEBHOOK_SECRET is missing or blank (BILLING_PROVIDER=razorpay).");
    else if ((platform.RAZORPAY_WEBHOOK_SECRET ?? "").length < MIN_SECRET_LENGTH) errors.push(`platform: RAZORPAY_WEBHOOK_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
    const app = urlOf(platform.APP_ORIGIN);
    const publicApp = urlOf(platform.NEXT_PUBLIC_APP_URL);
    if (app !== null && (publicApp === null || publicApp.origin !== app.origin)) errors.push("platform: NEXT_PUBLIC_APP_URL must be the same address as APP_ORIGIN (it is compiled into the build).");
  }
  if (admin !== undefined) checkApp("admin", admin, errors, warnings);
  if (platform !== undefined && admin !== undefined) {
    for (const name of SHARED_EQUAL) {
      if (!blank(platform[name]) && !blank(admin[name]) && platform[name]?.trim() !== admin[name]?.trim()) errors.push(`${name} differs between the platform's file and the console's; it must be identical.`);
    }
    const a = platform.FIRSTFOLD_MEDIA_ROOT?.trim() ?? "";
    const b = admin.FIRSTFOLD_MEDIA_ROOT?.trim() ?? "";
    if (a !== b) errors.push("FIRSTFOLD_MEDIA_ROOT differs between the two files: the dashboard writes uploads and the console reads them.");
  }
  return { errors, warnings };
}
