import { deploymentBrandId } from "./deployment-brand";

/*
 * The settings a real deployment must have before it starts (instrumentation.ts of each app) or builds on Vercel
 * (next.config.ts). Firstfold's lists are what they have always been. A Fynix deployment (PLATFORM_BRAND=fynix) is a
 * different product on its own server: it has no Firstfold marketing website to take leads from, no team inbox named in
 * the environment (alerts default to Fynix's own address), and no directory, SMS or video accounts, so none of those
 * settings is demanded of it. Every safety guard that is not about a feature (secrets, origins, no OTP bypass, a Brevo
 * key for account mail) is demanded of both.
 */
export type RequirementsApp = "platform" | "admin";
type Env = Readonly<Record<string, string | undefined>>;

const FIRSTFOLD_RUNTIME: Readonly<Record<RequirementsApp, readonly string[]>> = {
  platform: [
    "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD",
    "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "LEADS_API_TOKEN", "FIRSTFOLD_TEAM_EMAIL", "BREVO_API_KEY",
  ],
  admin: ["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_STAFF", "BETTER_AUTH_SECRET", "BREVO_API_KEY"],
};

const FYNIX_RUNTIME: Readonly<Record<RequirementsApp, readonly string[]>> = {
  // DATABASE_URL_PUBLIC carries the sign-up code and reset emails (insert-only outbox writes); ACCOUNT_CODE_SECRET signs the code.
  platform: [
    "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD",
    "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "ACCOUNT_CODE_SECRET", "BREVO_API_KEY",
  ],
  // The console's own schema (apps/admin/lib/server/env.ts) holds the Payload connection and secret.
  admin: ["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_STAFF", "DATABASE_URL_PAYLOAD", "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "BREVO_API_KEY"],
};

/** What `assertRuntimeEnvironment` holds a real deployment of `app` to. */
export function runtimeRequirements(app: RequirementsApp, env: Env = process.env): readonly string[] {
  return deploymentBrandId(env) === "fynix" ? FYNIX_RUNTIME[app] : FIRSTFOLD_RUNTIME[app];
}

const VERCEL_FIRSTFOLD = [
  "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL", "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF",
  "BETTER_AUTH_SECRET",
  // Without these the website's Get started form is refused or drops every lead in silence.
  "DATABASE_URL_PUBLIC", "LEADS_API_TOKEN", "FIRSTFOLD_TEAM_EMAIL",
  // Both unconditionally required by serverEnv()'s schema (see lib/server/env.ts).
  "DATABASE_URL_PAYLOAD", "PAYLOAD_SECRET",
] as const;

const VERCEL_FYNIX = [
  "NEXT_PUBLIC_APP_URL", "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "BETTER_AUTH_SECRET",
  "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD", "PAYLOAD_SECRET",
] as const;

/** What a Vercel production build is held to (next.config.ts, both apps). */
export function vercelProductionRequirements(env: Env = process.env): readonly string[] {
  return deploymentBrandId(env) === "fynix" ? VERCEL_FYNIX : VERCEL_FIRSTFOLD;
}
