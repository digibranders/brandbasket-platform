import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config } from "dotenv";

const WORKSPACE_MARKER = "pnpm-workspace.yaml";

/**
 * Next.js reads this file for apps/platform; scripts and tests outside Next.js load the same file.
 */
export const LOCAL_ENV_RELATIVE_PATH = join("apps", "platform", ".env.local");

/** Next.js reads this file for apps/admin. The staff console is its own app, so it has its own environment. */
export const ADMIN_ENV_RELATIVE_PATH = join("apps", "admin", ".env.local");

/** Walks up from `startDir` to the directory that contains pnpm-workspace.yaml. */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not find ${WORKSPACE_MARKER} above ${startDir}. Run this command inside the Brandbasket repository.`,
      );
    }
    current = parent;
  }
}

/**
 * Where scripts look when apps/platform has no env file (its folder is gone, or this is a release without it): apps/customer's
 * file for development, then its production file, which on the server is a link to shared/customer.env.production.
 */
const FALLBACK_ENV_RELATIVE_PATHS = [join("apps", "customer", ".env.local"), join("apps", "customer", ".env.production")];

/** The env file scripts load: apps/platform/.env.local when it exists, otherwise the first fallback that does. */
export function resolveLocalEnvPath(root: string = findWorkspaceRoot()): string | null {
  for (const relative of [LOCAL_ENV_RELATIVE_PATH, ...FALLBACK_ENV_RELATIVE_PATHS]) {
    const path = join(root, relative);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Loads apps/platform/.env.local (or the apps/customer file when it is missing) into process.env. Variables already set in the environment win. */
export function loadLocalEnv(): void {
  const path = resolveLocalEnvPath();
  if (path === null) {
    throw new Error(`${join(findWorkspaceRoot(), LOCAL_ENV_RELATIVE_PATH)} does not exist. Run "pnpm env:init" to create it.`);
  }
  config({ path, quiet: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Add it to ${LOCAL_ENV_RELATIVE_PATH}, or run "pnpm env:init" for a fresh file.`);
  }
  return value;
}
