import { isRealDeployment } from "@fynix/billing";

export class RuntimeEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeEnvironmentError";
  }
}

const CODE_BYPASS_SWITCHES = ["EMAIL_CODE_BYPASS"] as const;

/**
 * Stops a server that real customers can reach from starting with settings missing or unsafe. Runs at start from
 * instrumentation.ts, so a bad release fails its health check and the rolling deploy keeps the old one. The build-time
 * check in next.config.ts only runs on Vercel, which this deployment no longer uses.
 */
export function assertRuntimeEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  required: readonly string[],
): void {
  // A build is not a running server; vps-setup/platform/fynix-platform-build.env holds placeholders only.
  if (env.NEXT_PHASE === "phase-production-build") return;
  if (!isRealDeployment({ VERCEL_ENV: env.VERCEL_ENV, APP_ORIGIN: env.APP_ORIGIN })) return;

  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new RuntimeEnvironmentError(`This deployment is missing required settings: ${missing.join(", ")}. See .env.production.example (Fynix) or .env.example.`);
  }

  const bypasses = CODE_BYPASS_SWITCHES.filter((name) => env[name]?.trim() === "true");
  if (bypasses.length > 0) {
    throw new RuntimeEnvironmentError(`Code bypass switches must not be set here: ${bypasses.join(", ")}.`);
  }
}
