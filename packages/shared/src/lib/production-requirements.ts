/*
 * The settings a real deployment must have before it starts (instrumentation.ts of each app) or builds on Vercel
 * (next.config.ts). Fynix is its own product on its own server: it has no marketing website to take leads from, no team
 * inbox named in the environment (alerts default to Fynix's own address), and no directory or video accounts, so none
 * of those settings is demanded. It sends nothing to phones: every code is emailed. Every safety guard that is not about a
 * feature (secrets, origins, no code bypass, a Brevo key for the emailed codes) is demanded.
 */
export type RequirementsApp = "platform" | "admin";

const RUNTIME: Readonly<Record<RequirementsApp, readonly string[]>> = {
  // DATABASE_URL_PUBLIC carries the emailed codes (sign-up, a patient's booking, a privacy request) and reset emails (insert-only outbox writes); ACCOUNT_CODE_SECRET signs the codes.
  platform: [
    "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD",
    "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "ACCOUNT_CODE_SECRET", "BREVO_API_KEY",
  ],
  // The console's own schema (apps/admin/lib/server/env.ts) holds the Payload connection and secret.
  admin: ["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_STAFF", "DATABASE_URL_PAYLOAD", "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "BREVO_API_KEY"],
};

/** What `assertRuntimeEnvironment` holds a real deployment of `app` to. */
export function runtimeRequirements(app: RequirementsApp): readonly string[] {
  return RUNTIME[app];
}

const VERCEL_REQUIRED = [
  "NEXT_PUBLIC_APP_URL", "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "BETTER_AUTH_SECRET",
  "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD", "PAYLOAD_SECRET",
] as const;

/** What a Vercel production build is held to (next.config.ts, both apps). */
export function vercelProductionRequirements(): readonly string[] {
  return VERCEL_REQUIRED;
}
