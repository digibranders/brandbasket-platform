import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

/*
 * The parts of the R2-11 fixtures that touch no database code, so the console specs (which Playwright loads from
 * apps/admin, an ES module package) can import them without pulling in @brandbasket/db.
 */

export const CUSTOMER_ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3312";
export const CONSOLE_ORIGIN = process.env.E2E_CONSOLE_URL ?? "http://console.brandbasket.localhost:3313";
export const AUTH_DIR = resolve(__dirname, "../.auth-r2");
export const SCREEN_DIR = resolve(__dirname, "../../../../docs/implementation/reports/screenshots");

export const FIXTURES = ["website", "social", "unpaid", "failing", "invitee", "preview", "audit", "fresh"] as const;
export type FixtureKey = (typeof FIXTURES)[number];

export interface FixtureRecord {
  readonly email: string;
  readonly password: string;
  readonly businessName: string;
  readonly businessId?: string;
}

export const consoleStatePath = resolve(AUTH_DIR, "console.json");
export const statePath = (key: FixtureKey): string => resolve(AUTH_DIR, `${key}.json`);
export const recordPath = (key: FixtureKey): string => resolve(AUTH_DIR, `${key}.account.json`);

export function fixture(key: FixtureKey): FixtureRecord {
  return JSON.parse(readFileSync(recordPath(key), "utf8")) as FixtureRecord;
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

let shots = 0;
/** A small jpeg of the viewport for the report. At most 40 a process. */
export async function shot(page: Page, name: string): Promise<string | null> {
  if (shots >= 40) return null;
  shots += 1;
  mkdirSync(SCREEN_DIR, { recursive: true });
  const file = resolve(SCREEN_DIR, `${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 30, animations: "disabled" });
  return file;
}
