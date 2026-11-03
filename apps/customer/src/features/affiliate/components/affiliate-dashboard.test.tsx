import type { Affiliate, AffiliateCashOut, AffiliateEarning, AffiliateMonthlyActivity, AffiliatePayout, ListedReferralCode } from "@brandbasket/db";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/ui/test-axe";
import { AffiliateDashboard, type AffiliateDashboardProps } from "./affiliate-dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const NOW = new Date("2026-10-20T10:00:00.000Z");
const FAILED = { ok: false, error: { at: new Date("2026-10-20T05:00:00Z") } } as const;
const ok = <T,>(data: T) => ({ ok: true, data }) as const;

const AFFILIATE = { id: "aff-1", name: "Asha Nair", active: true, rewardCycles: 12 } as unknown as Affiliate;
const CODE = {
  id: "code-1",
  code: "ASHA10",
  active: true,
  expiresAt: null,
  maxRedemptions: null,
  redemptions: 2,
  currency: "INR",
  discount: { kind: "percent", basisPoints: 1000 },
  discountMonths: 3,
} as unknown as ListedReferralCode;
const CASH_OUT: AffiliateCashOut = { currency: "INR", earnedCents: 1_000_000, pendingCents: 200_000, cashedOutCents: 800_000, withheldCents: 0, receivedCents: 800_000, cancelledCents: 0 };
const EARNING = { id: "e1", code: "ASHA10", amountCents: 50_000, currency: "INR", cycleNumber: 2, status: "paid", createdAt: new Date("2026-10-10T10:00:00Z") } as unknown as AffiliateEarning;
const PAYOUT = { id: "p1", reference: "UTR123", amountCents: 800_000, withheldCents: 80_000, withheldReason: "TDS", currency: "INR", paidOn: "2026-10-12" } as unknown as AffiliatePayout;
const MONTH: AffiliateMonthlyActivity = { month: "2026-10", currency: "INR", payingMembers: 2, cents: 100_000, refunded: 0 };

function props(overrides: Partial<AffiliateDashboardProps> = {}): AffiliateDashboardProps {
  return {
    affiliate: AFFILIATE,
    now: NOW,
    codes: ok({ codes: [CODE], usage: new Map([["code-1", { codeId: "code-1", members: 2, payments: 3, discountGivenCents: 30_000 }]]) }),
    figures: ok({ members: { total: 2, paying: 1 }, cashOut: [CASH_OUT] }),
    monthly: ok([MONTH]),
    earnings: ok([EARNING]),
    payouts: ok([PAYOUT]),
    monthsShown: 6,
    earningLimit: 100,
    payoutLimit: 50,
    ...overrides,
  };
}

describe("AffiliateDashboard", () => {
  it("shows the code with its status, what members get and how it has been used", () => {
    render(<AffiliateDashboard {...props()} />);
    const table = screen.getByRole("table", { name: "Your codes" });
    expect(within(table).getByText("ASHA10")).toBeTruthy();
    expect(within(table).getByText("Live")).toBeTruthy();
    expect(within(table).getByText("Members get 10% off a month for 3 months")).toBeTruthy();
    expect(within(table).getByRole("button", { name: "Copy code" })).toBeTruthy();
  });

  it("shows the figures, the cash-out rows and the member count with who is paying", () => {
    render(<AffiliateDashboard {...props()} />);
    expect(screen.getByText("1 paying now")).toBeTruthy();
    const cashOut = screen.getByRole("table", { name: "Cash-out" });
    expect(within(cashOut).getByText("Received")).toBeTruthy();
    expect(within(cashOut).queryByText("Withheld")).toBeNull();
  });

  it("counts members past the old 500 cap", () => {
    render(<AffiliateDashboard {...props({ figures: ok({ members: { total: 1200, paying: 700 }, cashOut: [CASH_OUT] }) })} />);
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("700 paying now")).toBeTruthy();
  });

  it("says a paused affiliate's members keep earning", () => {
    render(<AffiliateDashboard {...props({ affiliate: { ...AFFILIATE, active: false } as Affiliate })} />);
    expect(screen.getByText(/new members can’t use them/)).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
  });

  it("explains the empty states in the old words", () => {
    render(<AffiliateDashboard {...props({ codes: ok({ codes: [], usage: new Map() }), earnings: ok([]), payouts: ok([]), monthly: ok([]) })} />);
    expect(screen.getByText("Your code is being set up.")).toBeTruthy();
    expect(screen.getByText("Nothing yet.")).toBeTruthy();
    expect(screen.queryByText("Payouts")).toBeNull();
    expect(screen.queryByText("By month")).toBeNull();
  });

  it("says which panel could not load and keeps the rest", () => {
    render(<AffiliateDashboard {...props({ figures: FAILED, earnings: FAILED })} />);
    expect(screen.getByText(/We could not load your figures/)).toBeTruthy();
    expect(screen.getByText(/We could not load your earnings/)).toBeTruthy();
    expect(screen.getByRole("table", { name: "Your codes" })).toBeTruthy();
  });

  it("shows a payout as what reached them with what was kept back beneath", () => {
    render(<AffiliateDashboard {...props()} />);
    const payouts = screen.getByRole("table", { name: "Payouts" });
    expect(within(payouts).getByText("₹7,200")).toBeTruthy();
    expect(within(payouts).getByText(/of ₹8,000, ₹800 withheld: TDS/)).toBeTruthy();
  });

  it("says the lists are the latest rows when they are full", () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ ...EARNING, id: `e${index}` }) as AffiliateEarning);
    render(<AffiliateDashboard {...props({ earnings: ok(full) })} />);
    expect(screen.getByText("Latest 100")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<AffiliateDashboard {...props()} />);
    await expectNoAxeViolations(container);
  });
});
