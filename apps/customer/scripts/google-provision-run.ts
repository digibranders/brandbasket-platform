import { createDatabase, listProvisionCandidates, saveProvisionedSource } from "@brandbasket/db";
import { requireEnv } from "@brandbasket/db/local-env";
import { loadCustomerEnv } from "./load-env";
import { flagIsOn } from "@brandbasket/shared/lib/launch-flags";
import { createAnalyticsAdmin } from "@brandbasket/shared/server/google/admin";
import { createAccountTokenSource } from "@brandbasket/shared/server/google/account-token";
import { GoogleAccessLost } from "@brandbasket/shared/server/google/oauth";
import { createSiteVerification } from "@brandbasket/shared/server/google/site-verification";
import { isComplete, provisionAll, skipReason, type ProvisionConfig } from "@/platform/lib/google-provision";
import { redeployProduction, setVercelProjectEnv } from "@/platform/lib/vercel-projects";

/*
 * `pnpm google:provision [--dry-run] [--only <businessId>]`: for every live site on its own domain, makes its Analytics property,
 * registers and verifies it in Search Console through a meta tag the site serves, and adds the second owner (plan 62). Safe to
 * run again and again: each step stores what it did and a finished business is left alone. A free address never gets a property.
 * brandbasket-google-provision.timer runs it every 15 minutes on the server (docs/deployment/brandbasket-vps.md, "Google").
 * Needs the Setting up sites sign-in connected in the console (Settings, Google account) and VERCEL_API_TOKEN.
 * `--dry-run` says what each business would get and calls neither Google nor Vercel.
 */

const DEFAULT_ACCOUNT_NAME = "Brandbasket clients";

function readConfig(): ProvisionConfig {
  const second = process.env.GOOGLE_SECOND_OWNER_EMAIL?.trim();
  return {
    analyticsAccountName: process.env.GOOGLE_ANALYTICS_ACCOUNT_NAME?.trim() || DEFAULT_ACCOUNT_NAME,
    mainAccountEmail: requireEnv("GOOGLE_ACCOUNT_EMAIL"),
    secondOwnerEmail: second ? second : null,
    analyticsTagEnabled: flagIsOn(process.env.GOOGLE_ANALYTICS_TAG_ENABLED),
    freeBaseDomain: process.env.CLIENT_SITE_BASE_DOMAIN?.trim() || null,
  };
}

async function pageShowsToken(hostname: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${hostname}/`, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "BrandbasketVerifyCheck/1" } });
    return response.ok && (await response.text()).includes(token);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  loadCustomerEnv();
  const dryRun = process.argv.includes("--dry-run");
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt === -1 ? undefined : process.argv[onlyAt + 1];
  const config = readConfig();
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 2 });
  try {
    const candidates = await listProvisionCandidates(db, only);
    console.log(`Google go live: ${candidates.length} live sites.`);
    if (dryRun) {
      for (const candidate of candidates) {
        const skipped = skipReason(candidate, config);
        const state = skipped !== null ? `skip (${skipped})` : isComplete(candidate, config) ? "complete" : "needs work";
        console.log(`  ${candidate.businessId} ${candidate.hostname}: ${state}`);
      }
      return;
    }
    const token = createAccountTokenSource(db, {
      slot: 1,
      purpose: "write",
      authSecret: requireEnv("BETTER_AUTH_SECRET"),
      credentials: { clientId: requireEnv("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET") },
    });
    const vercel = { token: process.env.VERCEL_API_TOKEN?.trim() || null };
    const outcomes = await provisionAll(candidates, {
      admin: createAnalyticsAdmin(token),
      verification: createSiteVerification(token),
      save: (input) => saveProvisionedSource(db, input),
      setEnv: (candidate, key, value) => setVercelProjectEnv(candidate, key, value, vercel),
      redeploy: (candidate) => redeployProduction(candidate, vercel),
      pageShowsToken,
      config,
      now: new Date(),
    });
    const count = (result: string): number => outcomes.filter((outcome) => outcome.result === result).length;
    console.log(`Google go live: ${count("complete")} complete, ${count("waiting")} waiting, ${count("working")} in progress, ${count("skipped")} skipped, ${count("error")} failed.`);
    const failed = outcomes.filter((outcome) => outcome.result === "error");
    for (const outcome of failed) console.error(`Google go live failed for business ${outcome.businessId}: ${outcome.note}`);
    // A failure on our side fails the run so the unit's failure alert is seen.
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof GoogleAccessLost) console.error(`Google go live stopped: ${error.message} Open Settings, Google account in the console and press Connect again on Setting up sites.`);
  else console.error("Google go live failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
