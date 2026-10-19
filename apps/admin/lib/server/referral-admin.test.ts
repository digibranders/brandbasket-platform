import {
  createReferralCode,
  deleteReferralCode,
  findActivePlan,
  findAffiliateById,
  findReferralCodeById,
  updateReferralCode,
  type Database,
  type Affiliate,
  type Plan,
  type ReferralCode,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import {
  createReferralCodeFor,
  deleteReferralCodeFor,
  referralWorth,
  retireReferralCodeFor,
  type ReferralAdminOutcome,
} from "./referral-admin";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    createReferralCode: vi.fn(),
    deleteReferralCode: vi.fn(),
    findActivePlan: vi.fn(),
    findAffiliateById: vi.fn(),
    findReferralCodeById: vi.fn(),
    updateReferralCode: vi.fn(),
  };
});

const STAFF_USER = "staff-1";
const NOW = new Date("2026-09-22T12:00:00.000Z");

const INR_PLAN = { id: "plan-inr", currency: "INR", initialAmountCents: 350_000 } as Plan;

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    code: "save15",
    currency: "INR",
    discountKind: "amount",
    discountValue: "500",
    expiresAt: "",
    maxRedemptions: "",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function refusalOf(outcome: ReferralAdminOutcome): { message: string; field: string | null } {
  if (outcome.kind !== "refused") throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  return outcome.refusal;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue({ name: "staff" } as unknown as Database);
  vi.mocked(findActivePlan).mockResolvedValue(INR_PLAN);
  vi.mocked(createReferralCode).mockImplementation(
    async (_db, input) => ({ id: "code-1", active: true, createdAt: new Date("2026-09-22T12:00:00.000Z"), ...input }) as ReferralCode,
  );
});

describe("createReferralCodeFor", () => {
  it("normalises the code and stores a coupon", async () => {
    const outcome = await createReferralCodeFor({ formData: form(), staffUserId: STAFF_USER, affiliateId: null, now: NOW });
    expect(outcome.kind).toBe("created");
    expect(createReferralCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: "SAVE15",
        currency: "INR",
        affiliateId: null,
        // "500" typed in rupees, stored as paise.
        discount: { kind: "amount", amountCents: 50_000 },
        expiresAt: null,
        maxRedemptions: null,
        createdByStaffId: STAFF_USER,
      }),
    );
  });

  it("refuses a malformed code", async () => {
    expect(refusalOf(await createReferralCodeFor({ formData: form({ code: "no" }), staffUserId: STAFF_USER, affiliateId: null, now: NOW })).field).toBe("code");
  });

  it("refuses a discount that is not an amount", async () => {
    for (const discountValue of ["", "abc", "-5", "1.234"]) {
      const outcome = await createReferralCodeFor({ formData: form({ discountValue }), staffUserId: STAFF_USER, affiliateId: null, now: NOW });
      expect(refusalOf(outcome).field).toBe("discountValue");
    }
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("stores a percentage discount in basis points, up to two decimals", async () => {
    for (const [typed, basisPoints] of [
      ["10", 1_000],
      ["12.5", 1_250],
      ["0.01", 1],
      ["99", 9_900],
    ] as const) {
      vi.mocked(createReferralCode).mockClear();
      const outcome = await createReferralCodeFor({
        formData: form({ discountKind: "percent", discountValue: typed }),
        staffUserId: STAFF_USER,
        affiliateId: null,
        now: NOW,
      });
      expect(outcome.kind).toBe("created");
      expect(createReferralCode).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ discount: { kind: "percent", basisPoints } }),
      );
    }
  });

  it("refuses a percentage discount outside 0.01% to 99%, or with a third decimal", async () => {
    for (const discountValue of ["", "0", "99.01", "100", "12.345", "-5", "ten"]) {
      const refusal = refusalOf(
        await createReferralCodeFor({ formData: form({ discountKind: "percent", discountValue }), staffUserId: STAFF_USER, affiliateId: null, now: NOW }),
      );
      expect(refusal.field).toBe("discountValue");
    }
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a percentage that rounds to nothing against the plan", async () => {
    vi.mocked(findActivePlan).mockResolvedValue({ ...INR_PLAN, initialAmountCents: 49 } as Plan);
    const refusal = refusalOf(
      await createReferralCodeFor({
        formData: form({ discountKind: "percent", discountValue: "0.01" }),
        staffUserId: STAFF_USER,
        affiliateId: null,
        now: NOW,
      }),
    );
    expect(refusal.field).toBe("discountValue");
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a discount kind it does not know", async () => {
    const refusal = refusalOf(
      await createReferralCodeFor({ formData: form({ discountKind: "free" }), staffUserId: STAFF_USER, affiliateId: null, now: NOW }),
    );
    expect(refusal.field).toBe("discountKind");
  });

  it("refuses a discount that leaves nothing for the provider to charge", async () => {
    // The INR plan is ₹3,500 a month; a ₹3,500 discount would leave a zero-amount subscription.
    for (const discountValue of ["3500", "4000"]) {
      const refusal = refusalOf(
        await createReferralCodeFor({ formData: form({ discountValue }), staffUserId: STAFF_USER, affiliateId: null, now: NOW }),
      );
      expect(refusal.field).toBe("discountValue");
      expect(refusal.message).toContain("nothing left to charge");
    }
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("accepts a discount just under the plan's price", async () => {
    const outcome = await createReferralCodeFor({ formData: form({ discountValue: "3499.99" }), staffUserId: STAFF_USER, affiliateId: null, now: NOW });
    expect(outcome.kind).toBe("created");
    expect(createReferralCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ discount: { kind: "amount", amountCents: 349_999 } }),
    );
  });

  it("reads an expiry as the end of that day, so the code lasts all of it", async () => {
    await createReferralCodeFor({ formData: form({ expiresAt: "2026-12-31" }), staffUserId: STAFF_USER, affiliateId: null, now: NOW });
    expect(createReferralCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiresAt: new Date("2026-12-31T23:59:59.999Z") }),
    );
  });

  it("refuses a new code whose expiry has already passed", async () => {
    const outcome = await createReferralCodeFor({
      formData: form({ expiresAt: "2026-09-21" }),
      staffUserId: STAFF_USER,
      affiliateId: null,
      now: NOW,
    });
    expect(refusalOf(outcome).field).toBe("expiresAt");
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("tells the difference between no cap and a cap it could not read", async () => {
    await createReferralCodeFor({ formData: form({ maxRedemptions: "" }), staffUserId: STAFF_USER, affiliateId: null, now: NOW });
    expect(createReferralCode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ maxRedemptions: null }));

    for (const maxRedemptions of ["0", "-1", "2.5", "lots"]) {
      const outcome = await createReferralCodeFor({ formData: form({ maxRedemptions }), staffUserId: STAFF_USER, affiliateId: null, now: NOW });
      expect(refusalOf(outcome).field).toBe("maxRedemptions");
    }
  });

  it("refuses a currency with no active plan to discount", async () => {
    vi.mocked(findActivePlan).mockResolvedValue(null);
    expect(refusalOf(await createReferralCodeFor({ formData: form(), staffUserId: STAFF_USER, affiliateId: null, now: NOW })).field).toBe("currency");
  });

  it("explains a duplicate code rather than throwing the database error at the staff member", async () => {
    vi.mocked(createReferralCode).mockRejectedValue(
      new Error('duplicate key value violates unique constraint "referral_codes_code_unique"'),
    );
    const refusal = refusalOf(await createReferralCodeFor({ formData: form(), staffUserId: STAFF_USER, affiliateId: null, now: NOW }));
    expect(refusal.field).toBe("code");
    expect(refusal.message).toContain("already exists");
  });

  it("does not swallow an unexpected database failure", async () => {
    vi.mocked(createReferralCode).mockRejectedValue(new Error("connection reset"));
    await expect(createReferralCodeFor({ formData: form(), staffUserId: STAFF_USER, affiliateId: null, now: NOW })).rejects.toThrow("connection reset");
  });
});

describe("createReferralCodeFor for an affiliate", () => {
  const AFFILIATE = {
    id: "affiliate-1",
    name: "Asha Nair",
    reward: { kind: "amount", amountCents: 20_000 },
    rewardCurrency: "INR",
    active: true,
  } as Affiliate;

  beforeEach(() => {
    vi.mocked(findAffiliateById).mockResolvedValue(AFFILIATE);
  });

  it("stores a code with no discount, which only an affiliate code may have", async () => {
    const outcome = await createReferralCodeFor({
      formData: form({ code: "priya", discountKind: "none", discountValue: "" }),
      staffUserId: STAFF_USER,
      affiliateId: "affiliate-1",
      now: NOW,
    });
    expect(outcome.kind).toBe("created");
    expect(createReferralCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: "PRIYA", affiliateId: "affiliate-1", discount: null }),
    );
  });

  it("refuses a coupon with no discount", async () => {
    const outcome = await createReferralCodeFor({
      formData: form({ discountKind: "none" }),
      staffUserId: STAFF_USER,
      affiliateId: null,
      now: NOW,
    });
    expect(refusalOf(outcome).field).toBe("discountKind");
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a code in another currency than the affiliate's fixed reward", async () => {
    const outcome = await createReferralCodeFor({
      formData: form({ currency: "USD" }),
      staffUserId: STAFF_USER,
      affiliateId: "affiliate-1",
      now: NOW,
    });
    expect(refusalOf(outcome)).toMatchObject({ field: "currency" });
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a code for an affiliate who is turned off, which could never be used", async () => {
    vi.mocked(findAffiliateById).mockResolvedValue({ ...AFFILIATE, active: false });
    const outcome = await createReferralCodeFor({ formData: form(), staffUserId: STAFF_USER, affiliateId: "affiliate-1", now: NOW });
    expect(refusalOf(outcome).message).toMatch(/turned off/);
    expect(createReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a code for an affiliate that no longer exists", async () => {
    vi.mocked(findAffiliateById).mockResolvedValue(null);
    const outcome = await createReferralCodeFor({ formData: form(), staffUserId: STAFF_USER, affiliateId: "gone", now: NOW });
    expect(refusalOf(outcome).field).toBeNull();
  });
});

describe("retireReferralCodeFor", () => {
  const EXISTING = {
    id: "code-1",
    code: "SAVE15",
    currency: "INR",
    discount: { kind: "amount", amountCents: 52_500 },
  } as ReferralCode;

  beforeEach(() => {
    vi.mocked(findReferralCodeById).mockResolvedValue(EXISTING);
    vi.mocked(updateReferralCode).mockImplementation(async (_db, input) => ({ ...EXISTING, ...input }) as ReferralCode);
  });

  it("deactivates a code without touching the discount, which is fixed for life", async () => {
    const data = new FormData();
    data.set("expiresAt", "");
    data.set("maxRedemptions", "");
    const outcome = await retireReferralCodeFor({ codeId: "code-1", formData: data });

    expect(outcome.kind).toBe("updated");
    // The discount, currency and affiliate are absent by construction: members already paying carry a frozen copy.
    expect(updateReferralCode).toHaveBeenCalledWith(expect.anything(), {
      id: "code-1",
      active: false,
      expiresAt: null,
      maxRedemptions: null,
    });
  });

  it("keeps a code active when the checkbox is on", async () => {
    const data = new FormData();
    data.set("active", "on");
    data.set("expiresAt", "2026-12-31");
    data.set("maxRedemptions", "5");
    await retireReferralCodeFor({ codeId: "code-1", formData: data });
    expect(updateReferralCode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ active: true, maxRedemptions: 5, expiresAt: new Date("2026-12-31T23:59:59.999Z") }),
    );
  });

  it("refuses a code that no longer exists", async () => {
    vi.mocked(findReferralCodeById).mockResolvedValue(null);
    const outcome = await retireReferralCodeFor({ codeId: "gone", formData: new FormData() });
    expect(refusalOf(outcome).field).toBeNull();
    expect(updateReferralCode).not.toHaveBeenCalled();
  });
});

describe("deleteReferralCodeFor", () => {
  function confirmed(tick = true): FormData {
    const data = new FormData();
    if (tick) data.set("confirm", "on");
    return data;
  }

  it("deletes a code nobody is on, reporting how many pending applications went with it", async () => {
    vi.mocked(deleteReferralCode).mockResolvedValue({ kind: "deleted", clearedApplications: 2 });
    const outcome = await deleteReferralCodeFor({ codeId: "code-1", formData: confirmed() });
    expect(outcome).toEqual({ kind: "deleted", clearedApplications: 2 });
  });

  it("will not delete without the tick, and does not reach the database to find out", async () => {
    const outcome = await deleteReferralCodeFor({ codeId: "code-1", formData: confirmed(false) });
    expect(refusalOf(outcome).field).toBe("confirm");
    expect(deleteReferralCode).not.toHaveBeenCalled();
  });

  it("refuses a code a customer is on, and says to turn it off instead", async () => {
    vi.mocked(deleteReferralCode).mockResolvedValue({ kind: "in-use", subscriptions: 1 });
    const refusal = refusalOf(await deleteReferralCodeFor({ codeId: "code-1", formData: confirmed() }));
    expect(refusal.message).toContain("A customer is on this code");
    expect(refusal.message).toContain("Turn it off instead");
  });

  it("counts the customers when more than one is on it", async () => {
    vi.mocked(deleteReferralCode).mockResolvedValue({ kind: "in-use", subscriptions: 4 });
    const refusal = refusalOf(await deleteReferralCodeFor({ codeId: "code-1", formData: confirmed() }));
    expect(refusal.message).toContain("4 customers are on this code");
  });

  it("reports a code that has already gone", async () => {
    vi.mocked(deleteReferralCode).mockResolvedValue({ kind: "not-found" });
    expect(refusalOf(await deleteReferralCodeFor({ codeId: "gone", formData: confirmed() })).message).toContain(
      "no longer exists",
    );
  });
});

describe("referralWorth", () => {
  const TAXED_PLAN = { id: "plan-inr", currency: "INR", initialAmountCents: 299_900, taxRateBasisPoints: 1_800 } as Plan;

  function codeWith(discount: ReferralCode["discount"]): ReferralCode {
    return { id: "code-1", code: "TENPCT", currency: "INR", affiliateId: null, discount } as ReferralCode;
  }

  beforeEach(() => {
    vi.mocked(findActivePlan).mockResolvedValue(TAXED_PLAN);
  });

  it("resolves a percentage discount against today's plan", async () => {
    expect(await referralWorth(codeWith({ kind: "percent", basisPoints: 1_000 }))).toEqual({
      planChargeCents: 353_882,
      discountCents: 29_990,
      customerPaysCents: 318_494,
      taxRateBasisPoints: 1_800,
    });
  });

  it("keeps a flat code's figures as they were", async () => {
    expect(await referralWorth(codeWith({ kind: "amount", amountCents: 50_000 }))).toMatchObject({
      discountCents: 50_000,
      customerPaysCents: 294_882,
    });
  });

  it("charges the full price on an affiliate code with no discount", async () => {
    expect(await referralWorth(codeWith(null))).toMatchObject({ discountCents: 0, customerPaysCents: 353_882 });
  });
});
