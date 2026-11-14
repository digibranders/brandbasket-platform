import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accounts,
  businessMembers,
  businesses,
  eraseClosedAccount,
  findActivePlan,
  findErasureBlock,
  insertSubscription,
  listClosuresDueForErasure,
  openAccountClosure,
  recordPaymentAndActivate,
  restoreAccountClosure,
  sessions,
  subscriptions,
  users,
  type Plan,
} from "@brandbasket/db";
import {
  eq,
  execSql,
  openTestDatabases,
  querySql,
  resetTestDatabase,
  seedPlansFromMigrations,
  type TestDatabases,
} from "@brandbasket/db/testing";
import { runAccountErasure, type ErasureDeps } from "./account-erasure-run";

const state = vi.hoisted(() => ({ dbs: null as TestDatabases | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/platform/lib/server/db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
  getAppDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.app.db;
  },
}));
vi.mock("@/lib/db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
  getAppDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.app.db;
  },
}));

const cmsDeleteMock = vi.fn(async () => ({ errors: [] }));
vi.mock("@/features/blog/server/payload", () => ({
  getBlogPayload: vi.fn(async () => ({
    delete: cmsDeleteMock,
  })),
}));

import { POST } from "@/app/api/internal/erase-closed-accounts/route";

const CLOSED_AT = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
const ERASE_AFTER = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
const NOW = new Date();
const TEST_TOKEN = "a".repeat(40);

let dbs: TestDatabases;
let plan: Plan;

beforeAll(async () => {
  dbs = openTestDatabases();
  state.dbs = dbs;
});

afterAll(async () => {
  state.dbs = null;
  await dbs.closeAll();
});

async function count(table: string, where = "true"): Promise<number> {
  const rows = await querySql<{ n: number }>(dbs.owner, `select count(*)::int as n from ${table} where ${where}`);
  return Number(rows[0]?.n ?? 0);
}

async function seedClosedAccount(
  userId = "closing-user-racing",
  bizSlug = "aster-physio",
  patientSlot = 1,
): Promise<{ closureId: string; businessId: string; userId: string }> {
  const db = dbs.owner.db;
  await db.insert(users).values({
    id: userId,
    name: "Meera Iyer",
    email: `${userId}@example.com`,
    emailVerified: true,
    phoneNumber: `+9198200${String(patientSlot).padStart(5, "0")}`,
    phoneNumberVerified: true,
  });
  await db.insert(sessions).values({ id: `s-${userId}`, token: `tok-${userId}`, expiresAt: NOW, userId });
  await db.insert(accounts).values({ id: `a-${userId}`, accountId: userId, providerId: "credential", userId, password: "hash" });
  const [business] = await db
    .insert(businesses)
    .values({ slug: bizSlug, name: "Aster Physio", currency: "INR", websiteUrl: "https://aster.example" })
    .returning({ id: businesses.id });
  const businessId = business?.id ?? "";
  await db.insert(businessMembers).values({ businessId, userId, role: "owner" });

  const pid = `00000000-0000-7000-8000-${String(patientSlot).padStart(12, "0")}`;
  await execSql(dbs.owner, `insert into patients (id, business_id, name, phone) values ('${pid}', '${businessId}', 'Anil Patient', '+919811111111')`);

  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${userId}`,
    referralCodeId: null,
    discountAmountCents: 0,
  });
  await recordPaymentAndActivate(dbs.staff.db, {
    businessId,
    subscriptionId: subscription.id,
    provider: "fake",
    providerPaymentId: `fake_pay_${userId}`,
    kind: "initial",
    amountCents: 100_000,
    currency: "INR",
    paidAt: CLOSED_AT,
    paidThroughAt: new Date("2026-10-20T12:00:00.000Z"),
    commitmentEndsAt: new Date("2026-10-20T12:00:00.000Z"),
    currentPeriodEnd: new Date("2026-10-20T12:00:00.000Z"),
  });
  await db
    .update(subscriptions)
    .set({ cancelRequestedAt: CLOSED_AT, status: "cancelled", cancelledAt: new Date("2026-10-20T12:00:00.000Z") })
    .where(eq(subscriptions.id, subscription.id));

  const closure = await openAccountClosure(dbs.staff.db, { userId, businessId, now: CLOSED_AT, eraseAfter: ERASE_AFTER });
  return { closureId: closure.id, businessId, userId };
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const active = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (active === null) throw new Error("No active INR plan was seeded");
  plan = active;
  cmsDeleteMock.mockClear();
  process.env.ACCOUNT_ERASE_TOKEN = TEST_TOKEN;
});

describe("account erasure integration", () => {
  it("restore racing erase: restores during the window and loses nothing (content and rows kept)", async () => {
    const { closureId, businessId, userId } = await seedClosedAccount();
    const cmsEraseSpy = vi.fn(async () => undefined);

    const testDeps: ErasureDeps = {
      listDue: (now, limit) => listClosuresDueForErasure(dbs.staff.db, now, limit),
      findBlock: async (id, now) => {
        const block = await findErasureBlock(dbs.staff.db, { closureId: id, now });
        // Restore races erase: restore happens right after initial block check, before eraseRows lock
        await restoreAccountClosure(dbs.staff.db, { userId, now });
        return block;
      },
      eraseWebsiteContent: cmsEraseSpy,
      eraseRows: (id, now) => eraseClosedAccount(dbs.staff.db, { closureId: id, now }),
      deleteFiles: vi.fn(async () => []),
      deleteVimeoVideos: vi.fn(async () => []),
    };

    const report = await runAccountErasure(testDeps, { now: NOW, limit: 10, dryRun: false });

    // Erasure skipped under lock:
    expect(report.items).toEqual([{ closureId, status: "skipped", reason: "not-due" }]);

    // CMS website content was never deleted:
    expect(cmsEraseSpy).not.toHaveBeenCalled();

    // Database rows were untouched:
    expect(await count("patients", `business_id = '${businessId}'`)).toBe(1);
    const [user] = await querySql<{ name: string; email: string }>(
      dbs.owner,
      `select name, email from users where id = '${userId}'`,
    );
    expect(user?.name).toBe("Meera Iyer");
    expect(user?.email).toBe(`${userId}@example.com`);

    // Closure reflects restored status, not erased:
    const [closure] = await querySql<{ restored_at: string | null; erased_at: string | null }>(
      dbs.owner,
      `select restored_at, erased_at from account_closures where id = '${closureId}'`,
    );
    expect(closure?.restored_at).not.toBeNull();
    expect(closure?.erased_at).toBeNull();
  });

  it("dry run: returns would-erase and modifies no data", async () => {
    const { closureId, businessId, userId } = await seedClosedAccount();
    const cmsEraseSpy = vi.fn(async () => undefined);

    const testDeps: ErasureDeps = {
      listDue: (now, limit) => listClosuresDueForErasure(dbs.staff.db, now, limit),
      findBlock: (id, now) => findErasureBlock(dbs.staff.db, { closureId: id, now }),
      eraseWebsiteContent: cmsEraseSpy,
      eraseRows: (id, now) => eraseClosedAccount(dbs.staff.db, { closureId: id, now }),
      deleteFiles: vi.fn(async () => []),
      deleteVimeoVideos: vi.fn(async () => []),
    };

    const report = await runAccountErasure(testDeps, { now: NOW, limit: 10, dryRun: true });

    expect(report).toEqual({
      dryRun: true,
      due: 1,
      items: [{ closureId, status: "would-erase" }],
    });

    expect(cmsEraseSpy).not.toHaveBeenCalled();
    expect(await count("patients", `business_id = '${businessId}'`)).toBe(1);

    const [closure] = await querySql<{ erased_at: string | null }>(
      dbs.owner,
      `select erased_at from account_closures where id = '${closureId}'`,
    );
    expect(closure?.erased_at).toBeNull();

    const [user] = await querySql<{ name: string }>(
      dbs.owner,
      `select name from users where id = '${userId}'`,
    );
    expect(user?.name).toBe("Meera Iyer");
  });

  it("limit: erases no more than the specified limit when multiple accounts are due", async () => {
    const account1 = await seedClosedAccount("user-1", "biz-1", 1);
    const account2 = await seedClosedAccount("user-2", "biz-2", 2);

    const cmsEraseSpy = vi.fn(async () => undefined);

    const testDeps: ErasureDeps = {
      listDue: (now, limit) => listClosuresDueForErasure(dbs.staff.db, now, limit),
      findBlock: (id, now) => findErasureBlock(dbs.staff.db, { closureId: id, now }),
      eraseWebsiteContent: cmsEraseSpy,
      eraseRows: (id, now) => eraseClosedAccount(dbs.staff.db, { closureId: id, now }),
      deleteFiles: vi.fn(async () => []),
      deleteVimeoVideos: vi.fn(async () => []),
    };

    const report = await runAccountErasure(testDeps, { now: NOW, limit: 1, dryRun: false });

    expect(report.due).toBe(1);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.status).toBe("erased");
    expect(cmsEraseSpy).toHaveBeenCalledTimes(1);

    const erasedClosureId = report.items[0]?.closureId;
    const remainingAccount = erasedClosureId === account1.closureId ? account2 : account1;

    // Remaining account was not touched:
    expect(await count("patients", `business_id = '${remainingAccount.businessId}'`)).toBe(1);
    const [remClosure] = await querySql<{ erased_at: string | null }>(
      dbs.owner,
      `select erased_at from account_closures where id = '${remainingAccount.closureId}'`,
    );
    expect(remClosure?.erased_at).toBeNull();
  });

  describe("route authentication and execution via POST", () => {
    it("answers 503 when the secret is not configured", async () => {
      delete process.env.ACCOUNT_ERASE_TOKEN;
      const request = new Request("http://localhost/api/internal/erase-closed-accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      });
      const response = await POST(request);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "The erase job is not configured." });
    });

    it("answers 401 when the secret is missing or incorrect", async () => {
      const missingAuth = new Request("http://localhost/api/internal/erase-closed-accounts", {
        method: "POST",
      });
      const resMissing = await POST(missingAuth);
      expect(resMissing.status).toBe(401);
      expect(await resMissing.json()).toEqual({ error: "Unauthorised." });

      const wrongAuth = new Request("http://localhost/api/internal/erase-closed-accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${"x".repeat(40)}` },
      });
      const resWrong = await POST(wrongAuth);
      expect(resWrong.status).toBe(401);
      expect(await resWrong.json()).toEqual({ error: "Unauthorised." });
    });

    it("runs dry run through the route endpoint and modifies nothing", async () => {
      const { closureId, businessId } = await seedClosedAccount();
      const request = new Request("http://localhost/api/internal/erase-closed-accounts?dryRun=1&limit=5", {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        dryRun: true,
        due: 1,
        items: [{ closureId, status: "would-erase" }],
      });

      // Data is intact in the database:
      expect(await count("patients", `business_id = '${businessId}'`)).toBe(1);
    });
  });
});
