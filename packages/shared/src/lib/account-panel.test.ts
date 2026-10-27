import { describe, expect, it } from "vitest";
import { PAYMENT_STEP_HREF, type BillingBannerModel } from "@brandbasket/shared/lib/billing/payment-step";
import type { NextStep } from "@brandbasket/shared/lib/next-step";
import { actionableCount, noticesFrom, siteStatusLine } from "./account-panel";

const NO_STEP: NextStep = { kind: "none" };

const PAY_BANNER: BillingBannerModel = {
  kind: "pay",
  title: "Make your payment to continue",
  message: "",
  price: null,
  action: { href: "/billing/pay", label: "Pay now" },
};

const REACTIVATE_BANNER: BillingBannerModel = {
  kind: "reactivate",
  title: "Your plan has ended",
  message: "",
  action: { href: "/billing", label: "Reactivate" },
};
const NOTICE_BANNER: BillingBannerModel = { kind: "notice", title: "Payment received", message: "" };

const RETRYING_BANNER: BillingBannerModel = {
  kind: "retrying",
  title: "We couldn’t take your last payment",
  message: "",
  action: { href: "/billing", label: "See Billing" },
};

describe("noticesFrom, requests", () => {
  const ask = (requests: Parameters<typeof noticesFrom>[0]["requests"]) => noticesFrom({ banner: null, projectStatus: "live", nextStep: { kind: "live", hostname: "x.com" }, requests });

  it("lists a quote to answer, a payment to make and a change to check as things to do, each opening its request", () => {
    expect(
      ask([
        { ticketId: "t1", subject: "Add an Implants page", kind: "quote" },
        { ticketId: "t2", subject: "Change the main photo", kind: "check" },
        { ticketId: "t3", subject: "Footer", kind: "payment" },
      ]),
    ).toEqual([
      { id: "request-quote-t1", text: "Quote waiting: Add an Implants page", href: "/requests?open=t1", actionable: true },
      { id: "request-check-t2", text: "Ready to check: Change the main photo", href: "/requests?open=t2", actionable: true },
      { id: "request-payment-t3", text: "Payment waiting: Footer", href: "/requests?open=t3", actionable: true },
    ]);
  });

  it("lists a reply to read without lighting the dot", () => {
    const notices = ask([{ ticketId: "t1", subject: "Add an Implants page", kind: "reply" }]);
    expect(notices).toEqual([{ id: "request-reply-t1", text: "New reply: Add an Implants page", href: "/requests?open=t1", actionable: false }]);
    expect(actionableCount(notices)).toBe(0);
  });

  it("shortens a long title, and says nothing about requests when none are given", () => {
    const [notice] = ask([{ ticketId: "t1", subject: "x".repeat(100), kind: "quote" }]);
    expect(notice?.text.length).toBeLessThan(80);
    expect(notice?.text.endsWith("...")).toBe(true);
    expect(ask(undefined)).toEqual([]);
  });
});

describe("noticesFrom", () => {
  it("is empty for a paid customer whose site is live and settled", () => {
    expect(noticesFrom({ banner: null, projectStatus: "live", nextStep: { kind: "live", hostname: "x.com" } })).toEqual(
      [],
    );
  });

  it("lists a failing renewal as actionable, pointing at Billing", () => {
    const [notice] = noticesFrom({ banner: RETRYING_BANNER, projectStatus: null, nextStep: NO_STEP });
    expect(notice).toMatchObject({ id: "payment-retrying", text: "Your last payment didn’t go through", href: "/billing", actionable: true });
  });

  it("treats a due payment as actionable and points at the payment step", () => {
    const [notice] = noticesFrom({ banner: PAY_BANNER, projectStatus: null, nextStep: NO_STEP });
    expect(notice).toMatchObject({ id: "payment-due", actionable: true });
    // Not /billing: the first payment is made at the end of setup ("Pay and send"), wherever that step lives.
    expect(notice?.href).toBe(PAYMENT_STEP_HREF);
  });

  it("treats a lapsed plan as actionable", () => {
    const notices = noticesFrom({ banner: REACTIVATE_BANNER, projectStatus: null, nextStep: NO_STEP });
    expect(notices).toEqual([{ id: "plan-ended", text: "Your plan has ended", href: "/billing", actionable: true }]);
  });

  it("treats a payment under review as news, not a task", () => {
    const [notice] = noticesFrom({ banner: NOTICE_BANNER, projectStatus: null, nextStep: NO_STEP });
    expect(notice?.actionable).toBe(false);
  });

  it("asks the customer to review a preview, on the Website page", () => {
    const [notice] = noticesFrom({ banner: null, projectStatus: "preview", nextStep: NO_STEP });
    expect(notice).toMatchObject({ id: "preview-ready", href: "/website", actionable: true });
  });

  it.each([
    ["submitted", "building"],
    ["building", "building"],
    ["revisions", "revisions"],
    ["on_hold", "on-hold"],
  ] as const)("reports %s as something we are doing, not something they must do, on the Website page", (status, id) => {
    const [notice] = noticesFrom({ banner: null, projectStatus: status, nextStep: NO_STEP });
    expect(notice).toMatchObject({ id, href: "/website", actionable: false });
  });

  it.each(["start-onboarding", "continue-onboarding"] as const)("chases unfinished setup (%s)", (kind) => {
    const step = (kind === "start-onboarding" ? { kind } : { kind, completed: 1, total: 4 }) as NextStep;
    const notices = noticesFrom({ banner: null, projectStatus: "onboarding", nextStep: step });
    expect(notices).toEqual([
      { id: "finish-setup", text: "Finish setting up your website", href: "/onboarding", actionable: true },
    ]);
  });

  it("does not chase setup once the build has started", () => {
    const notices = noticesFrom({
      banner: null,
      projectStatus: "building",
      nextStep: { kind: "building", slaDueAt: null },
    });
    expect(notices.map((notice) => notice.id)).toEqual(["building"]);
  });

  it("lists a payment and a build together, counting only the payment as needing them", () => {
    const notices = noticesFrom({ banner: PAY_BANNER, projectStatus: "building", nextStep: NO_STEP });
    expect(notices.map((notice) => notice.id)).toEqual(["payment-due", "building"]);
    expect(actionableCount(notices)).toBe(1);
  });
});

describe("siteStatusLine", () => {
  it.each([
    [{ kind: "online" } as const, "All systems normal", "ok"],
    [{ kind: "offline", reason: "payment_lapsed" } as const, "Your website is offline", "warn"],
    [{ kind: "not_launched" } as const, "Not live yet", "neutral"],
  ])("describes %o", (status, text, tone) => {
    expect(siteStatusLine(status)).toEqual({ text, tone });
  });
});
