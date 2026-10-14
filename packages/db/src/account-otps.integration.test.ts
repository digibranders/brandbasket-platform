import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimAccountOtpAttempt,
  consumeAccountOtp,
  createAccountOtp,
  findUserByEmail,
  findUserByPhone,
  purgeExpiredAccountOtps,
} from "./queries/account-otps";
import { accountOtps, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-09-30T10:00:00.000Z");
const IN_TEN_MINUTES = new Date(NOW.getTime() + 10 * 60 * 1000);
const PHONE = "+919820011223";

let dbs: TestDatabases;

async function newOtp(overrides: { readonly expiresAt?: Date; readonly purpose?: "signup" | "password_reset" } = {}): Promise<string> {
  const id = randomUUID();
  await createAccountOtp(dbs.staff.db, {
    id,
    purpose: overrides.purpose ?? "signup",
    phone: PHONE,
    codeHash: "a".repeat(64),
    expiresAt: overrides.expiresAt ?? IN_TEN_MINUTES,
  });
  return id;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("account codes", () => {
  it("hands back what the code is for with each try, and counts the tries", async () => {
    const otpId = await newOtp({ purpose: "password_reset" });
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 5, now: NOW })).toEqual({
      attempts: 1,
      purpose: "password_reset",
      phone: PHONE,
      email: null,
      codeHash: "a".repeat(64),
    });
    expect((await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 5, now: NOW }))?.attempts).toBe(2);
  });

  it("gives no more tries than allowed", async () => {
    const otpId = await newOtp();
    await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 2, now: NOW });
    await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 2, now: NOW });
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 2, now: NOW })).toBeNull();
  });

  it("gives no try for a code that has run out, that never existed, or whose id is not one", async () => {
    const expired = await newOtp({ expiresAt: new Date(NOW.getTime() - 1000) });
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId: expired, maxAttempts: 5, now: NOW })).toBeNull();
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId: randomUUID(), maxAttempts: 5, now: NOW })).toBeNull();
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId: "not-an-id", maxAttempts: 5, now: NOW })).toBeNull();
  });

  it("is used up exactly once", async () => {
    const otpId = await newOtp();
    expect(await consumeAccountOtp(dbs.staff.db, otpId)).toBe(true);
    expect(await consumeAccountOtp(dbs.staff.db, otpId)).toBe(false);
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 5, now: NOW })).toBeNull();
  });

  it("purges codes an hour after they run out, and no sooner", async () => {
    const old = await newOtp({ expiresAt: new Date(NOW.getTime() - 61 * 60 * 1000) });
    const recent = await newOtp({ expiresAt: new Date(NOW.getTime() - 5 * 60 * 1000) });
    expect(await purgeExpiredAccountOtps(dbs.staff.db, NOW)).toBe(1);
    const left = await dbs.staff.db.select({ id: accountOtps.id }).from(accountOtps);
    expect(left.map((row) => row.id)).toEqual([recent]);
    expect(left.map((row) => row.id)).not.toContain(old);
  });

  it("is closed to the customer and public roles", async () => {
    const otpId = await newOtp();
    expect(await captureErrorText(dbs.app.db.select().from(accountOtps).where(eq(accountOtps.id, otpId)))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(accountOtps).where(eq(accountOtps.id, otpId)))).toContain("permission denied");
  });
});

describe("a code emailed to an address", () => {
  const EMAIL = "owner@example.test";

  async function newEmailOtp(email: string = EMAIL): Promise<string> {
    const id = randomUUID();
    await createAccountOtp(dbs.staff.db, { id, purpose: "signup", email, codeHash: "b".repeat(64), expiresAt: IN_TEN_MINUTES });
    return id;
  }

  it("hands back the address the code was sent to, and no number", async () => {
    const otpId = await newEmailOtp();
    expect(await claimAccountOtpAttempt(dbs.staff.db, { otpId, maxAttempts: 5, now: NOW })).toEqual({
      attempts: 1,
      purpose: "signup",
      phone: null,
      email: EMAIL,
      codeHash: "b".repeat(64),
    });
  });

  it("is used up exactly once, like a texted code", async () => {
    const otpId = await newEmailOtp();
    expect(await consumeAccountOtp(dbs.staff.db, otpId)).toBe(true);
    expect(await consumeAccountOtp(dbs.staff.db, otpId)).toBe(false);
  });

  it("must be addressed to a phone or an email, never both and never neither", async () => {
    const insert = (phone: string | null, email: string | null): Promise<unknown> =>
      dbs.owner.db.execute(
        sql`INSERT INTO account_otps (id, purpose, phone, email, code_hash, expires_at)
            VALUES (${randomUUID()}, 'signup', ${phone}, ${email}, ${"c".repeat(64)}, ${IN_TEN_MINUTES.toISOString()})`,
      );
    expect(await captureErrorText(insert(PHONE, EMAIL))).toContain("account_otps_contact_check");
    expect(await captureErrorText(insert(null, null))).toContain("account_otps_contact_check");
    expect(await captureErrorText(insert(null, "not an address"))).toContain("account_otps_email_check");
    await insert(null, EMAIL);
  });
});

describe("an account's phone number", () => {
  it("finds the account a verified number signs in to", async () => {
    await dbs.staff.db.insert(users).values({
      id: "phone-owner",
      name: "Asha",
      email: "919820011223@phone.fynix.invalid",
      phoneNumber: PHONE,
      phoneNumberVerified: true,
    });
    expect(await findUserByPhone(dbs.app.db, PHONE)).toEqual({ id: "phone-owner", name: "Asha", email: "919820011223@phone.fynix.invalid" });
    expect(await findUserByPhone(dbs.app.db, "+919820099999")).toBeNull();
  });

  it("does not find a number nobody has proven is theirs", async () => {
    await dbs.staff.db.insert(users).values({ id: "unproven", name: "X", email: "x@example.com", phoneNumber: PHONE });
    expect(await findUserByPhone(dbs.app.db, PHONE)).toBeNull();
  });

  it("belongs to one account only, and must be a full international number", async () => {
    await dbs.staff.db.insert(users).values({ id: "first", name: "A", email: "a@example.com", phoneNumber: PHONE, phoneNumberVerified: true });
    expect(
      await captureErrorText(dbs.staff.db.insert(users).values({ id: "second", name: "B", email: "b@example.com", phoneNumber: PHONE })),
    ).toContain("users_phone_number_unique");
    expect(
      await captureErrorText(dbs.staff.db.insert(users).values({ id: "third", name: "C", email: "c@example.com", phoneNumber: "9820011223" })),
    ).toContain("users_phone_number_check");
  });
});

describe("an account's email address", () => {
  it("finds the account that signs in with an address, whatever case it was typed in", async () => {
    await dbs.staff.db.insert(users).values({ id: "email-owner", name: "Meera", email: "meera@example.test" });
    expect(await findUserByEmail(dbs.app.db, "meera@example.test")).toEqual({ id: "email-owner", name: "Meera", email: "meera@example.test" });
    expect(await findUserByEmail(dbs.app.db, "Meera@Example.TEST")).toMatchObject({ id: "email-owner" });
    expect(await findUserByEmail(dbs.app.db, "someone.else@example.test")).toBeNull();
  });
});
