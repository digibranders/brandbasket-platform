import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users, verifications } from "../schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "../testing";
import { findPendingResetAccountEmail, isPasswordPending } from "./account-otps";

const NOW = new Date("2026-11-26T10:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

let databases: TestDatabases;

beforeAll(() => {
  databases = openTestDatabases();
});
beforeEach(async () => {
  await resetTestDatabase(databases.owner);
});
afterAll(async () => {
  await databases.closeAll();
});

async function seedUser(id: string, email: string, passwordPending: boolean): Promise<void> {
  await databases.staff.db.insert(users).values({ id, email, name: "Riley Owner", passwordPending });
}

async function seedLink(token: string, userId: string, expiresAt: Date): Promise<void> {
  await databases.staff.db.insert(verifications).values({ id: `v-${token}`, identifier: `reset-password:${token}`, value: userId, expiresAt });
}

describe("findPendingResetAccountEmail", () => {
  it("names the account of a live link that is waiting for its first password", async () => {
    await seedUser("u1", "owner@example.com", true);
    await seedLink("tok-1", "u1", new Date(NOW.getTime() + HOUR_MS));
    await expect(findPendingResetAccountEmail(databases.staff.db, "tok-1", NOW)).resolves.toBe("owner@example.com");
  });

  it("says nothing for an account that already has a password", async () => {
    await seedUser("u2", "other@example.com", false);
    await seedLink("tok-2", "u2", new Date(NOW.getTime() + HOUR_MS));
    await expect(findPendingResetAccountEmail(databases.staff.db, "tok-2", NOW)).resolves.toBeNull();
  });

  it("says nothing for an expired, unknown or oversized token", async () => {
    await seedUser("u3", "late@example.com", true);
    await seedLink("tok-3", "u3", new Date(NOW.getTime() - 1000));
    await expect(findPendingResetAccountEmail(databases.staff.db, "tok-3", NOW)).resolves.toBeNull();
    await expect(findPendingResetAccountEmail(databases.staff.db, "nope", NOW)).resolves.toBeNull();
    await expect(findPendingResetAccountEmail(databases.staff.db, "x".repeat(200), NOW)).resolves.toBeNull();
  });

  it("does not use the link up", async () => {
    await seedUser("u4", "keep@example.com", true);
    await seedLink("tok-4", "u4", new Date(NOW.getTime() + HOUR_MS));
    await findPendingResetAccountEmail(databases.staff.db, "tok-4", NOW);
    await expect(findPendingResetAccountEmail(databases.staff.db, "tok-4", NOW)).resolves.toBe("keep@example.com");
  });
});

describe("isPasswordPending", () => {
  it("is true only for a pending account, whatever the address's case", async () => {
    await seedUser("u5", "pending@example.com", true);
    await seedUser("u6", "chosen@example.com", false);
    await expect(isPasswordPending(databases.staff.db, " Pending@Example.com ")).resolves.toBe(true);
    await expect(isPasswordPending(databases.staff.db, "chosen@example.com")).resolves.toBe(false);
    await expect(isPasswordPending(databases.staff.db, "nobody@example.com")).resolves.toBe(false);
  });
});
