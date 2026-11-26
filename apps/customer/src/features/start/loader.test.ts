import { NO_ANSWERS } from "@brandbasket/shared/lib/intake/questions";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBusinessEntry, loadSavedServices } from "../checkout/server/entry";
import { loadMembershipCheckout } from "../checkout/server/membership-checkout";
import { loadStart } from "./loader";
import { loadIntake } from "./server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("../checkout/server/entry", () => ({ loadBusinessEntry: vi.fn(), loadSavedServices: vi.fn() }));
vi.mock("../checkout/server/membership-checkout", () => ({ loadMembershipCheckout: vi.fn() }));
vi.mock("./server", () => ({ loadIntake: vi.fn() }));

const PLAN = { initialAmountCents: 0, recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1_800, initialTermMonths: 1 };

function customer(services: readonly string[] = ["website"]) {
  return { tenant: { businessId: "biz-1" }, role: "owner", currency: "INR", services } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
  vi.mocked(loadSavedServices).mockResolvedValue([]);
  vi.mocked(loadIntake).mockResolvedValue({ answers: NO_ANSWERS, completedAt: null });
  vi.mocked(loadMembershipCheckout).mockResolvedValue({ plan: PLAN, services: ["managed-website"], forfeited: false, hasEverPaid: false, firstMonth: null } as never);
});

describe("loadStart for an account that has not paid", () => {
  it("is asked the questions on the basket in the address, with its prices beside them", async () => {
    const view = await loadStart(customer(), { services: "managed-website,social-media", q: "businessType" });
    expect(view).toMatchObject({ phase: "before-payment", services: ["managed-website", "social-media"], step: { kind: "question" } });
    expect(loadMembershipCheckout).toHaveBeenCalled();
    expect(view.aside).toMatchObject({ ok: true });
    expect(view.aside.ok && view.aside.data).toBeTruthy();
  });

  it("is sent to the first unanswered question when no step is named", async () => {
    await expect(loadStart(customer(), { services: "managed-website" })).rejects.toThrow(/^redirect:\/start\?services=managed-website&q=businessType/);
  });

  it("is not sent Home when its questions are finished: it still has checkout to do", async () => {
    vi.mocked(loadIntake).mockResolvedValue({ answers: NO_ANSWERS, completedAt: new Date() });
    await expect(loadStart(customer(), { services: "managed-website", q: "summary" })).resolves.toMatchObject({ phase: "before-payment" });
  });
});

describe("loadStart for a member who has paid", () => {
  beforeEach(() => {
    vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: "managed" });
  });

  it("is admitted to the questions when it has not finished them, with nothing priced", async () => {
    const view = await loadStart(customer(), { q: "businessType" });
    expect(view).toMatchObject({ phase: "after-payment", step: { kind: "question" }, aside: { ok: true, data: null } });
    expect(loadMembershipCheckout).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("is sent Home when staff invited it: only a sign-up that paid here is asked afterwards", async () => {
    vi.mocked(loadBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
    await expect(loadStart(customer(), { q: "businessType" })).rejects.toThrow("redirect:/");
    expect(loadIntake).not.toHaveBeenCalled();
  });

  it("is sent Home when it has finished them", async () => {
    vi.mocked(loadIntake).mockResolvedValue({ answers: NO_ANSWERS, completedAt: new Date() });
    await expect(loadStart(customer(), { q: "businessType" })).rejects.toThrow("redirect:/");
  });

  it("is asked about what it bought, never the basket in the address", async () => {
    const view = await loadStart(customer(["website", "social"]), { services: "managed-website,paid-ads", q: "summary" });
    expect(view.services).toEqual(["managed-website", "social-media"]);
    expect(view.step).toMatchObject({ kind: "summary", summary: { prices: {} } });
  });

  it("falls back to the saved basket, then the website alone", async () => {
    vi.mocked(loadSavedServices).mockResolvedValue(["social-media"]);
    expect((await loadStart(customer([]), { q: "summary" })).services).toEqual(["social-media"]);
    vi.mocked(loadSavedServices).mockResolvedValue([]);
    expect((await loadStart(customer([]), { q: "summary" })).services).toEqual(["managed-website"]);
  });

  it("sends the open question's address without prices when no step is named", async () => {
    await expect(loadStart(customer(), {})).rejects.toThrow(/^redirect:\/start\?services=managed-website&q=businessType/);
  });
});
