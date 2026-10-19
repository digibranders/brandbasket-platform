import {
  cancelAffiliateEarning,
  createAffiliate,
  listAffiliateCodeCurrencies,
  recordAffiliatePayout,
  updateAffiliate,
  type Affiliate,
  type Database,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelEarningFor,
  createAffiliateFor,
  describeAffiliateReward,
  describeRewardCycles,
  payoutToday,
  recordPayoutFor,
  updateAffiliateFor,
  type AffiliateAdminOutcome,
} from "./affiliate-admin";
import { getStaffDb } from "./db";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    cancelAffiliateEarning: vi.fn(),
    createAffiliate: vi.fn(),
    listAffiliateCodeCurrencies: vi.fn(),
    recordAffiliatePayout: vi.fn(),
    updateAffiliate: vi.fn(),
  };
});

const STAFF_USER = "staff-1";
const NOW = new Date("2026-10-06T20:00:00.000Z");
const AFFILIATE_ID = "01a0e81e-89b6-704e-a3c2-702156218f36";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const ASHA = { name: "Asha Nair", phone: "98765 43210", email: "", rewardKind: "amount", rewardValue: "200", rewardCurrency: "INR", notes: "" };

function refusalOf(outcome: AffiliateAdminOutcome): { message: string; field: string | null } {
  if (outcome.kind !== "refused") throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  return outcome.refusal;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue({ name: "staff" } as unknown as Database);
  vi.mocked(createAffiliate).mockImplementation(async (_db, input) => ({ id: AFFILIATE_ID, active: true, ...input }) as unknown as Affiliate);
  vi.mocked(updateAffiliate).mockImplementation(async (_db, input) => input as unknown as Affiliate);
  vi.mocked(listAffiliateCodeCurrencies).mockResolvedValue(["INR"]);
});

describe("createAffiliateFor", () => {
  it("stores an Indian number typed without a country code as E.164, and a rupee reward in paise", async () => {
    const outcome = await createAffiliateFor({ formData: form(ASHA), staffUserId: STAFF_USER });
    expect(outcome.kind).toBe("saved");
    expect(createAffiliate).toHaveBeenCalledWith(expect.anything(), {
      name: "Asha Nair",
      email: null,
      phone: "+919876543210",
      reward: { kind: "amount", amountCents: 20_000 },
      rewardCurrency: "INR",
      rewardCycles: null,
      notes: null,
      createdByStaffId: STAFF_USER,
    });
  });

  it("stores a percentage reward with no currency", async () => {
    await createAffiliateFor({ formData: form({ ...ASHA, rewardKind: "percent", rewardValue: "7.5" }), staffUserId: STAFF_USER });
    expect(createAffiliate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reward: { kind: "percent", basisPoints: 750 }, rewardCurrency: null }),
    );
  });

  it("stores a limit of paid months, and refuses one that is not a whole number from 1 to 120", async () => {
    await createAffiliateFor({ formData: form({ ...ASHA, rewardCycles: "12" }), staffUserId: STAFF_USER });
    expect(createAffiliate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rewardCycles: 12 }));
    for (const typed of ["0", "121", "2.5", "lots"]) {
      const outcome = await createAffiliateFor({ formData: form({ ...ASHA, rewardCycles: typed }), staffUserId: STAFF_USER });
      expect(refusalOf(outcome).field).toBe("rewardCycles");
    }
  });

  it("needs a way to reach them", async () => {
    const outcome = await createAffiliateFor({ formData: form({ ...ASHA, phone: "" }), staffUserId: STAFF_USER });
    expect(refusalOf(outcome).field).toBe("phone");
    expect(createAffiliate).not.toHaveBeenCalled();
  });

  it("refuses a phone that is not a phone number, and a percentage over 100%", async () => {
    expect(refusalOf(await createAffiliateFor({ formData: form({ ...ASHA, phone: "12" }), staffUserId: STAFF_USER })).field).toBe("phone");
    expect(
      refusalOf(
        await createAffiliateFor({ formData: form({ ...ASHA, rewardKind: "percent", rewardValue: "101" }), staffUserId: STAFF_USER }),
      ).field,
    ).toBe("rewardValue");
  });
});

describe("updateAffiliateFor", () => {
  it("refuses a fixed reward in a currency some of their codes are not in", async () => {
    vi.mocked(listAffiliateCodeCurrencies).mockResolvedValue(["INR", "USD"]);
    const outcome = await updateAffiliateFor({ affiliateId: AFFILIATE_ID, formData: form(ASHA) });
    expect(refusalOf(outcome).field).toBe("rewardCurrency");
    expect(updateAffiliate).not.toHaveBeenCalled();
  });

  it("turns an affiliate off when the box is unticked", async () => {
    await updateAffiliateFor({ affiliateId: AFFILIATE_ID, formData: form(ASHA) });
    expect(updateAffiliate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: AFFILIATE_ID, active: false }));
  });
});

describe("recordPayoutFor", () => {
  const PAYOUT = { currency: "INR", earningIds: "e1,e2", paidOn: "2026-10-06", reference: "UTR123" };

  it("passes the earnings the page showed", async () => {
    vi.mocked(recordAffiliatePayout).mockResolvedValue({ kind: "recorded", payoutId: "p1", amountCents: 40_000 });
    const outcome = await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form(PAYOUT), staffUserId: STAFF_USER, now: NOW });
    expect(outcome).toEqual({ kind: "paid", amountCents: 40_000 });
    expect(recordAffiliatePayout).toHaveBeenCalledWith(expect.anything(), {
      affiliateId: AFFILIATE_ID,
      currency: "INR",
      earningIds: ["e1", "e2"],
      paidOn: "2026-10-06",
      reference: "UTR123",
      withheldCents: 0,
      withheldReason: null,
      recordedByStaffId: STAFF_USER,
    });
  });

  it("passes what was withheld, in paise, with its reason trimmed", async () => {
    vi.mocked(recordAffiliatePayout).mockResolvedValue({ kind: "recorded", payoutId: "p1", amountCents: 40_000 });
    await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, withheld: "1,200.50", withheldReason: "  TDS at 10%  " }), staffUserId: STAFF_USER, now: NOW });
    expect(recordAffiliatePayout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ withheldCents: 120_050, withheldReason: "TDS at 10%" }));
  });

  it("needs a reason for what was withheld, and an amount it can read, before it reaches the database", async () => {
    expect(
      refusalOf(await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, withheld: "200" }), staffUserId: STAFF_USER, now: NOW })).field,
    ).toBe("withheldReason");
    expect(
      refusalOf(await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, withheld: "two hundred", withheldReason: "TDS" }), staffUserId: STAFF_USER, now: NOW })).field,
    ).toBe("withheld");
    expect(recordAffiliatePayout).not.toHaveBeenCalled();
  });

  it("drops a reason typed beside nothing withheld, so the two always come together", async () => {
    vi.mocked(recordAffiliatePayout).mockResolvedValue({ kind: "recorded", payoutId: "p1", amountCents: 40_000 });
    await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, withheld: "", withheldReason: "TDS" }), staffUserId: STAFF_USER, now: NOW });
    expect(recordAffiliatePayout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ withheldCents: 0, withheldReason: null }));
  });

  it("explains a withheld amount that is the whole payout or more", async () => {
    vi.mocked(recordAffiliatePayout).mockResolvedValue({ kind: "bad-withheld" });
    const outcome = await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, withheld: "999999", withheldReason: "TDS" }), staffUserId: STAFF_USER, now: NOW });
    expect(refusalOf(outcome).field).toBe("withheld");
  });

  it("refuses a transfer dated after today in India, and accepts today", async () => {
    // 20:00 UTC on 6 October is 01:30 on 7 October in India.
    vi.mocked(recordAffiliatePayout).mockResolvedValue({ kind: "recorded", payoutId: "p1", amountCents: 40_000 });
    const future = await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, paidOn: "2026-10-08" }), staffUserId: STAFF_USER, now: NOW });
    expect(refusalOf(future).field).toBe("paidOn");
    const today = await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, paidOn: "2026-10-07" }), staffUserId: STAFF_USER, now: NOW });
    expect(today.kind).toBe("paid");
  });

  it("starts the form on India's date, not the server's", () => {
    expect(payoutToday(NOW)).toBe("2026-10-07");
  });

  it("explains a payout refused because the owed earnings changed", async () => {
    vi.mocked(recordAffiliatePayout).mockResolvedValue({ kind: "stale" });
    const outcome = await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form(PAYOUT), staffUserId: STAFF_USER, now: NOW });
    expect(refusalOf(outcome).message).toMatch(/changed/);
  });

  it("needs a date and a reference before it reaches the database", async () => {
    expect(
      refusalOf(await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, reference: "" }), staffUserId: STAFF_USER, now: NOW }))
        .field,
    ).toBe("reference");
    expect(
      refusalOf(await recordPayoutFor({ affiliateId: AFFILIATE_ID, formData: form({ ...PAYOUT, paidOn: "6 Oct" }), staffUserId: STAFF_USER, now: NOW }))
        .field,
    ).toBe("paidOn");
    expect(recordAffiliatePayout).not.toHaveBeenCalled();
  });
});

describe("cancelEarningFor", () => {
  it("says so when the earning was not owed any more", async () => {
    vi.mocked(cancelAffiliateEarning).mockResolvedValue(false);
    const outcome = await cancelEarningFor({ affiliateId: AFFILIATE_ID, earningId: "e1", staffUserId: STAFF_USER, now: new Date() });
    expect(outcome.kind).toBe("refused");
  });
});

describe("describeRewardCycles", () => {
  it("reads every month, one month, and a number of months", () => {
    expect(describeRewardCycles(null)).toBe("every paid month");
    expect(describeRewardCycles(1)).toBe("first paid month only");
    expect(describeRewardCycles(12)).toBe("first 12 paid months");
  });
});

describe("describeAffiliateReward", () => {
  it("reads both kinds", () => {
    expect(describeAffiliateReward({ reward: { kind: "amount", amountCents: 20_000 }, rewardCurrency: "INR" })).toBe("₹200 a month");
    expect(describeAffiliateReward({ reward: { kind: "percent", basisPoints: 750 }, rewardCurrency: null })).toBe("7.5% of each payment");
    expect(describeAffiliateReward({ reward: { kind: "amount", amountCents: 0 }, rewardCurrency: "INR" })).toBe("Nothing");
  });
});
