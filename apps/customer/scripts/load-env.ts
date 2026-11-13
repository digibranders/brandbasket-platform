import { existsSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot } from "@brandbasket/db/local-env";

/**
 * Loads apps/customer's own env file for a job script: `.env.production` on the server (a link to
 * shared/customer.env.production, the file `next start` reads) and `.env.local` on a developer machine. Node's loader
 * keeps values already in the process environment, as Next does, so the app needs no dotenv dependency.
 */
export function loadCustomerEnv(): void {
  const name = process.env.NODE_ENV === "production" ? ".env.production" : ".env.local";
  const path = join(findWorkspaceRoot(), "apps", "customer", name);
  if (!existsSync(path)) throw new Error(`${path} does not exist. Jobs read apps/customer's env file.`);
  process.loadEnvFile(path);
}
