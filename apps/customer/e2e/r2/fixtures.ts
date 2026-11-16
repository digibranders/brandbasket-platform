import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, hashInviteToken, sendChangeQuote, type DatabaseHandle } from "@brandbasket/db";
import { expect, type Page } from "@playwright/test";
import { answerStart, choose, payOnTestCheckout, unique } from "../support";
import { AUTH_DIR, fixture, recordPath, settle, type FixtureKey, type FixtureRecord } from "./lite";

/*
 * R2-11 fixtures. The existing suite assumes a seeded v4 database; this one builds its own accounts by signing up through
 * the app (the emailed code is read from the local outbox) and then adjusts state with SQL on the staff connection.
 * Local r211 database only. Needs the shell environment described in docs/implementation/reports/R2-11.md.
 */

export * from "./lite";

const ALLOWED_DATABASE = "brandbasket_platform_r211";
let handle: DatabaseHandle | null = null;

/** The staff connection. Refuses to run unless it points at the r211 database. */
export async function sql<T extends object = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T[]> {
  const url = process.env.DATABASE_URL_STAFF;
  if (url === undefined || !url.endsWith(`/${ALLOWED_DATABASE}`)) throw new Error(`DATABASE_URL_STAFF must end in /${ALLOWED_DATABASE}.`);
  handle ??= createDatabase(url, { max: 2 });
  const result = await handle.db.$client.query(text, [...params]);
  return result.rows as T[];
}

export async function closeDb(): Promise<void> {
  await handle?.close();
  handle = null;
}

/** The newest six-digit code mailed to an address (the outbox keeps it locally). */
export async function codeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const rows = await sql<{ body_text: string; transport: string; status: string }>(
      "select body_text, transport, status from email_messages where to_address = $1 and template = 'signup-code' order by created_at desc limit 1",
      [email],
    );
    const row = rows[0];
    if (row !== undefined) {
      expect(row.transport, "nothing real is sent").toBe("outbox");
      expect(row.status).toBe("local_only");
      const code = /\b(\d{6})\b/.exec(row.body_text)?.[1];
      if (code !== undefined) return code;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`No sign-up code reached the outbox for ${email}.`);
}

/** Sign up through the real form with the emailed code. Leaves the page on the first screen after sign-up. */
export async function signUp(page: Page, plan: string, key: FixtureKey): Promise<FixtureRecord> {
  const record: FixtureRecord = { email: `e2e+r211-${key}-${unique()}@example.test`, password: `E2e-${unique()}-Pw!42`, businessName: `R211 ${key} Bakery ${unique()}` };
  // Sign-up is rate limited per network; the r211 database is ours alone, so clear its buckets between sign-ups.
  await clearLimits();
  await page.goto(`/signup?plan=${plan}`);
  await page.getByLabel("Business name").fill(record.businessName);
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Email", { exact: true }).fill(record.email);
  await choose(page, "State", "Maharashtra");
  await page.getByRole("textbox", { name: "Mobile number" }).fill(`9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`);
  await page.getByLabel("Choose a password").fill(record.password);
  await page.getByRole("checkbox", { name: /I agree/ }).click();
  await page.getByRole("button", { name: /^(Email me a code|Continue)$/ }).click();
  await expect(page.getByLabel("Code", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Code", { exact: true }).fill(await codeFor(record.email));
  await page.getByRole("button", { name: /^(Verify and continue|Continue)$/ }).click();
  await page.waitForURL((url) => url.pathname !== "/signup", { timeout: 60_000 });
  await settle(page);
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(recordPath(key), JSON.stringify(record));
  return record;
}

/** Intake, billing address and the fake provider's test checkout. */
export async function payForPlan(page: Page): Promise<void> {
  await answerStart(page);
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByLabel("Address line 1").fill("12 FC Road");
  await page.getByLabel("Pincode").fill("411004");
  await page.getByLabel("City").fill("Pune");
  await choose(page, "State", "Maharashtra");
  await page.getByRole("button", { name: /^Pay / }).click();
  // The confirm dialog (R2) sits between Pay and the payment window.
  await page.getByRole("dialog", { name: "Confirm your plan" }).getByRole("button", { name: /^Pay / }).click();
  await payOnTestCheckout(page);
}

/** Give a signed-up account console access with the repo's own command. */
export function makeStaff(email: string): void {
  execFileSync("pnpm", ["staff:create", "--email", email, "--name", "Audit", "--role", "admin"], { cwd: resolve(__dirname, "../../../.."), stdio: "ignore" });
}

export const businessIdFor = async (email: string): Promise<string> => {
  const rows = await sql<{ id: string }>(
    "select b.id from businesses b join business_members m on m.business_id = b.id join users u on u.id = m.user_id where u.email = $1 order by b.created_at limit 1",
    [email],
  );
  if (rows[0] === undefined) throw new Error(`No business for ${email}.`);
  return rows[0].id;
};

export const userIdFor = async (email: string): Promise<string> => {
  const rows = await sql<{ id: string }>("select id from users where email = $1", [email]);
  if (rows[0] === undefined) throw new Error(`No user for ${email}.`);
  return rows[0].id;
};

/** Staff sends a quote on a request, as the console would: 2 hours at 500 rupees an hour, 3 working days. */
export async function quoteAsStaff(requestId: string): Promise<void> {
  await sql("select 1");
  if (handle === null) throw new Error("database handle missing");
  await sendChangeQuote(handle.db, { requestId, staffId: await userIdFor(fixture("audit").email), what: "R2-11 test change", hours: 2, workingDays: 3, unitCents: 50_000, currency: "INR", now: new Date() });
}

/** An invitation to a business. `state` makes it expired, revoked or already used. */
export async function makeInvite(businessId: string, inviterEmail: string, inviteeEmail: string, state: "open" | "expired" | "revoked" | "used"): Promise<string> {
  await sql("delete from business_invites where business_id = $1 and email = $2 and accepted_at is null", [businessId, inviteeEmail]);
  const token = `r211${unique()}${unique()}${unique()}`.padEnd(43, "x");
  const now = Date.now();
  const day = 86_400_000;
  await sql(
    "insert into business_invites (id, business_id, email, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at) values ($1, $2, $3, 'editor', $4, $5, $6, $7, $8, $9)",
    [crypto.randomUUID(), businessId, inviteeEmail, hashInviteToken(token), await userIdFor(inviterEmail), new Date(now + (state === "expired" ? -day : 7 * day)), state === "used" ? new Date(now) : null, state === "revoked" ? new Date(now) : null, new Date(now - 8 * day)],
  );
  return token;
}

export const clearLimits = async (): Promise<void> => {
  await sql("delete from rate_limit_buckets");
};

const BOOKING_LINK = "https://book.example.test/kickoff";
export const setBookingLink = async (): Promise<void> => {
  await sql("insert into site_settings (key, value) values ('setup_call_url', $1) on conflict (key) do nothing", [BOOKING_LINK]);
};
export const removeBookingLink = async (): Promise<void> => {
  await sql("delete from site_settings where key = 'setup_call_url' and value = $1", [BOOKING_LINK]);
};

/** Remember the business id in the fixture record so the console specs need no database access. */
export async function saveBusinessId(key: FixtureKey): Promise<void> {
  const record = fixture(key);
  writeFileSync(recordPath(key), JSON.stringify({ ...record, businessId: await businessIdFor(record.email) }));
}
