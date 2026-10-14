import { describe, expect, it } from "vitest";
import { PAYMENT_STEP_HREF, type BillingBannerModel } from "@firstfold/shared/lib/billing/payment-step";
import type { NextStep } from "@firstfold/shared/lib/next-step";
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

  it("asks the customer to review a preview", () => {
    const [notice] = noticesFrom({ banner: null, projectStatus: "preview", nextStep: NO_STEP });
    expect(notice).toMatchObject({ id: "preview-ready", href: "/project", actionable: true });
  });

  it.each([
    ["submitted", "building"],
    ["building", "building"],
    ["revisions", "revisions"],
    ["on_hold", "on-hold"],
  ] as const)("reports %s as something we are doing, not something they must do", (status, id) => {
    const [notice] = noticesFrom({ banner: null, projectStatus: status, nextStep: NO_STEP });
    expect(notice).toMatchObject({ id, actionable: false });
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
