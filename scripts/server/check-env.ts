/*
 * Checks a Brandbasket deployment's environment files before the apps are started on them. Run by scripts/server/deploy.sh on the
 * server (and by hand): it reads the two files, prints problems by setting name (never a value), and exits 1 if any stop a
 * deploy. The rules are packages/shared/src/lib/production-env-check.ts, which has the tests.
 *
 *   pnpm exec tsx scripts/server/check-env.ts --platform /srv/brandbasket/shared/platform.env.local --admin /srv/brandbasket/shared/admin.env.local
 *
 * Either flag may be left out to check one file alone. Needs nothing from the network or the database.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkProductionEnv, parseEnvFile } from "../../packages/shared/src/lib/production-env-check";

const { values } = parseArgs({ options: { platform: { type: "string" }, admin: { type: "string" } } });
if (values.platform === undefined && values.admin === undefined) {
  console.error("Usage: check-env.ts --platform <file> --admin <file>   (either may be left out)");
  process.exit(64);
}

function read(path: string | undefined): Record<string, string> | undefined {
  if (path === undefined) return undefined;
  try {
    return parseEnvFile(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const platform = read(values.platform);
const admin = read(values.admin);
const result = checkProductionEnv({ ...(platform === undefined ? {} : { platform }), ...(admin === undefined ? {} : { admin }) });
for (const warning of result.warnings) console.warn(`warning: ${warning}`);
for (const error of result.errors) console.error(`error:   ${error}`);
if (result.errors.length > 0) {
  console.error(`${result.errors.length} problem(s): fix the environment file(s) and run again.`);
  process.exit(1);
}
console.log(`Environment OK (${result.warnings.length} warning(s)).`);
