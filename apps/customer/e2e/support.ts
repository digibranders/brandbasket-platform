import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, insertDeliverable, sendChangeQuote, type DatabaseHandle } from "@brandbasket/db";
import { expect, type Page } from "@playwright/test";

/*
 * Shared helpers for the flows. The staff side of a flow (sending a quote, putting a post up for approval) has no screen
 * in this app, so it is done here through the same @brandbasket/db helpers the console and the seed use, on the staff
 * connection from .env.local. Local databases only.
 */

export const unique = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

/** Pick an option in a Base UI select by the combobox's accessible name. */
export async function choose(page: Page, combobox: string, option: string | RegExp): Promise<void> {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Pay on the fake provider's test checkout, which stands in for Razorpay's window locally. */
export async function payOnTestCheckout(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Test payment" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL((url) => !/\/confirm/.test(url.pathname), { timeout: 60_000 });
  await settle(page);
}

function readEnv(name: string): string {
  const file = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
  const line = file.split("\n").find((candidate) => candidate.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  if (value === undefined || value === "") throw new Error(`${name} is not set in apps/customer/.env.local.`);
  return value;
}

const LOCAL_DATABASE = /@(localhost|127\.0\.0\.1)(:\d+)?\/brandbasket_platform_v4$/;

let handle: DatabaseHandle | null = null;

/** The staff connection to the local v4 database. Refuses anything that is not the local v4 database. */
export function staffDb(): DatabaseHandle {
  if (handle !== null) return handle;
  const url = readEnv("DATABASE_URL_STAFF");
  if (!LOCAL_DATABASE.test(url)) throw new Error("The flows write only to the local brandbasket_platform_v4 database.");
  handle = createDatabase(url, { max: 2 });
  return handle;
}

export async function closeDb(): Promise<void> {
  await handle?.close();
  handle = null;
}

async function one<T>(sql: string, params: readonly unknown[]): Promise<T> {
  const result = await staffDb().db.$client.query(sql, [...params]);
  const row = result.rows[0] as T | undefined;
  if (row === undefined) throw new Error(`No row for: ${sql}`);
  return row;
}

export const businessIdOf = async (slug: string): Promise<string> =>
  (await one<{ id: string }>("select id from businesses where slug = $1", [slug])).id;

const seedStaffId = async (): Promise<string> =>
  (await one<{ id: string }>("select id from users where email = 'staff+seed-v4@example.test'", [])).id;

/** The newest change request of a business made after `since`. */
export const newestChangeSince = async (businessId: string, since: Date): Promise<{ id: string; ticketId: string; state: string }> =>
  one("select id, ticket_id as \"ticketId\", state from change_requests where business_id = $1 and created_at >= $2 order by created_at desc limit 1", [businessId, since]);

/** Staff sends a quote, as the console would: 2 hours at ₹500 an hour, 3 working days. */
export async function quoteAsStaff(requestId: string): Promise<void> {
  const staffId = await seedStaffId();
  await sendChangeQuote(staffDb().db, { requestId, staffId, what: "E2E test change", hours: 2, workingDays: 3, unitCents: 50_000, currency: "INR", now: new Date() });
}

/** Staff puts a post up for approval, as the console would. */
export async function postForApproval(businessId: string, title: string): Promise<void> {
  const dueOn = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
  await insertDeliverable(staffDb().db, {
    id: crypto.randomUUID(),
    businessId,
    kind: "post",
    title,
    caption: "Made by the end-to-end tests. Safe to ignore.",
    format: "post",
    channel: "instagram",
    dueOn,
    status: "awaiting_approval",
    staffId: await seedStaffId(),
  });
}

export const deliverableStatus = async (businessId: string, title: string): Promise<string> =>
  (await one<{ status: string }>("select status from deliverables where business_id = $1 and title = $2", [businessId, title])).status;

const BOOKING_LINK = "https://book.example.test/kickoff";

/**
 * The kickoff booking needs the staff's booking link (site setting setup_call_url); the v4 seed sets none. A link that is
 * neither Cal.com nor Calendly makes the app use its local stand-in scheduler. True when this call added it.
 */
export async function ensureBookingLink(): Promise<boolean> {
  const result = await staffDb().db.$client.query("insert into site_settings (key, value) values ('setup_call_url', $1) on conflict (key) do nothing", [BOOKING_LINK]);
  return result.rowCount === 1;
}

export async function removeBookingLink(): Promise<void> {
  await staffDb().db.$client.query("delete from site_settings where key = 'setup_call_url' and value = $1", [BOOKING_LINK]);
}

/** Removes a post this run made for approval, so the seed's social screens stay as seeded. */
export async function removeTestPost(businessId: string, title: string): Promise<void> {
  await staffDb().db.$client.query("delete from deliverables where business_id = $1 and title = $2 and title like 'E2E post %'", [businessId, title]);
}
