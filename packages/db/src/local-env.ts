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
        `Could not find ${WORKSPACE_MARKER} above ${startDir}. Run this command inside the Firstfold repository.`,
      );
    }
    current = parent;
  }
}

/** Loads apps/platform/.env.local into process.env. Variables already set in the environment win. */
export function loadLocalEnv(): void {
  const path = join(findWorkspaceRoot(), LOCAL_ENV_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist. Run "pnpm env:init" to create it.`);
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
