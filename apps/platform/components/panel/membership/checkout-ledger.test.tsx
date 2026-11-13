// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerCode, LedgerPricing } from "@/lib/checkout-ledger";
import { CODE_NEEDS_A_PAID_SERVICE } from "@/lib/membership";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import { CheckoutLedger } from "./checkout-ledger";

vi.mock("@/app/app-host/(protected)/plan/actions", () => ({
  startMembership: vi.fn(async () => ({ status: "idle" })),
  startMembershipWithBilling: vi.fn(async () => ({ status: "idle" })),
  applyMembershipCode: vi.fn(async () => ({ status: "idle" })),
  removeMembershipCode: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ saveBillingDetailsAction: vi.fn(), lookupBillingPincodeAction: vi.fn() }));

const routerReplace = vi.hoisted(() => vi.fn());
const PRICING: LedgerPricing = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false };
const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLElement;
let root: Root;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  window.history.replaceState(null, "", "/plan");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const EMPTY_START = { legalName: "Smile Dental", gstin: "", addressLine1: "", addressLine2: "", city: "", postalCode: "", stateCode: "", email: "", phoneCountry: "IN", phone: "" };

/** What the page hands a business billed in rupees: nothing saved yet, or saved details. */
function billingView(saved: BillingDetailsView["saved"] = null): BillingDetailsView {
  return { saved, businessName: "Smile Dental", start: EMPTY_START };
}

function render(
  initialServices: readonly ("managed-website" | "social-media" | "paid-ads")[],
  choosable = true,
  billingDetails: BillingDetailsView | null = null,
  changeServicesHref: string | null = null,
  pricing: LedgerPricing = PRICING,
  code: LedgerCode | null = null,
  paidThrough: string | null = null,
): void {
  act(() => {
    root.render(
      <CheckoutLedger
        tier="managed"
        initialServices={initialServices}
        choosable={choosable}
        changeServicesHref={changeServicesHref}
        pricing={pricing}
        initialTermMonths={1}
        code={code}
        lapsedCode={null}
        billingDetails={billingDetails}
        paymentFailed={false}
        billingHrefs={{ monthlyHref: "/plan?services=managed-website", yearlyHref: "/plan?services=managed-website&billing=yearly" }}
        paidThrough={paidThrough}
      />,
    );
  });
}

const chip = (name: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((button) => button.textContent?.includes(name));
  if (found === undefined) throw new Error(`No plan chip for ${name}`);
  return found;
};
const total = (): string | null | undefined => container.querySelector('[data-testid="due-total"]')?.textContent;
const click = (button: HTMLElement): void => act(() => button.click());
const posted = (): string[] => [...container.querySelectorAll<HTMLInputElement>('form input[name="service"]')].map((input) => input.value);

describe("CheckoutLedger", () => {
  it("shows the website alone, with its GST, when that is what the address named", () => {
    render(["managed-website"]);
    expect(total()).toBe("₹2,999");
    expect(container.textContent).toContain("Includes ₹457.48 of GST at 18%");
    expect(chip("Website Management").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Paid Ads Management").getAttribute("aria-pressed")).toBe("false");
  });

  it("updates the total, the lines and the address as plans are chosen, without a network call", () => {
    render(["managed-website"]);

    click(chip("Social Media Management"));
    expect(total()).toBe("₹5,998");
    expect(container.textContent).not.toContain("% off");
    expect(window.location.search).toBe("?services=managed-website,social-media");
    expect(posted()).toEqual(["managed-website", "social-media"]);

    click(chip("Paid Ads Management"));
    expect(total()).toBe("₹8,997");
    expect(container.textContent).toContain("All three plans: Dedicated Expert Monitoring free every month.");

    click(chip("Website Management"));
    expect(window.location.search).toBe("?services=social-media,paid-ads");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the last plan chosen, so the basket is never empty", () => {
    render(["social-media"]);
    click(chip("Social Media Management"));
    expect(chip("Social Media Management").getAttribute("aria-pressed")).toBe("true");
    expect(total()).toBe("₹2,999");
  });

  it("lists what you get for the chosen plans only", () => {
    render(["managed-website"]);
    expect(container.textContent).toContain("A website of up to 10 pages, mobile-friendly");
    expect(container.textContent).not.toContain("Meta ads on Facebook and Instagram");
    click(chip("Paid Ads Management"));
    expect(container.textContent).toContain("Meta ads on Facebook and Instagram");
  });

  it("offers no choice when the services are fixed", () => {
    render(["managed-website", "social-media"], false);
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
    expect(total()).toBe("₹5,998");
  });

  describe("billing details", () => {
    const payForm = (): HTMLFormElement => {
      const form = container.querySelector<HTMLFormElement>("form#checkout-pay");
      if (form === null) throw new Error("No pay form");
      return form;
    };
    const SAVED = { legalName: "Riverside Dental LLP", gstin: "27AAPFU0939F1ZV", address: "12 Hill Road, Pune 411001", stateCode: "27", email: null, phone: null };

    it("asks a business billed in rupees for its address inside the Pay form, so Pay saves them and pays together", () => {
      render(["managed-website"], true, billingView());
      const form = payForm();
      expect(form.querySelector('input[name="addressLine1"]')).not.toBeNull();
      expect(form.querySelector('input[name="postalCode"]')).not.toBeNull();
      expect(form.querySelector('input[name="service"]')).not.toBeNull();
      expect(form.textContent).toContain("cannot be changed once it is issued");
      expect(form.textContent).not.toContain("You can pay without it");
    });

    it("asks for the legal name and GSTIN only once the business says it has a GSTIN", () => {
      render(["managed-website"], true, billingView());
      expect(payForm().querySelector('input[name="legalName"]')).toBeNull();
      const box = payForm().querySelector<HTMLInputElement>('input[name="hasGstin"]');
      if (box === null) throw new Error("No GST checkbox");
      click(box);
      expect(payForm().querySelector('input[name="gstin"]')).not.toBeNull();
      expect(payForm().querySelector<HTMLInputElement>('input[name="legalName"]')?.required).toBe(true);
    });

    it("shows saved details as a line, with no fields, until Change is pressed", () => {
      render(["managed-website"], true, billingView(SAVED));
      expect(payForm().querySelector('input[name="addressLine1"]')).toBeNull();
      expect(payForm().textContent).toContain("Riverside Dental LLP, GSTIN 27AAPFU0939F1ZV");
      const change = [...payForm().querySelectorAll("button")].find((button) => button.textContent === "Change billing details");
      if (change === undefined) throw new Error("No Change button");
      click(change);
      expect(payForm().querySelector('input[name="addressLine1"]')).not.toBeNull();
    });

    it("keeps the Pay form as it was for a business that gets no tax invoice", () => {
      render(["managed-website"]);
      expect(payForm().querySelector('input[name="addressLine1"]')).toBeNull();
      expect(container.textContent).not.toContain("Billing details");
    });
  });

  it("keeps the services as they were chosen and points back to the questions' summary to change them", () => {
    render(["managed-website", "social-media"], false, null, "/personalize?services=managed-website,social-media&q=summary");
    expect(container.querySelector("button[aria-pressed]")).toBeNull();
    expect(container.querySelector('a[href="/personalize?services=managed-website,social-media&q=summary"]')?.textContent).toBe("Change services");
    expect(posted()).toEqual(["managed-website", "social-media"]);
  });

  it("offers no way back when the services cannot be changed anywhere (a plan being bought back)", () => {
    render(["managed-website"], false);
    expect(container.textContent).not.toContain("Change services");
  });

  it("asks for a code before the billing details and the Pay button", () => {
    render(["managed-website"], true, billingView());
    const text = container.textContent ?? "";
    expect(text.indexOf("Have a code?")).toBeGreaterThan(-1);
    expect(text.indexOf("Billing details")).toBeGreaterThan(text.indexOf("Have a code?"));
    expect(text.indexOf("Pay ₹")).toBeGreaterThan(text.indexOf("Have a code?"));
  });

  describe("the payment confirmation", () => {
    const dialog = (): HTMLDialogElement => {
      const found = container.querySelector("dialog");
      if (found === null) throw new Error("No dialog");
      return found;
    };
    const pageButton = (): HTMLButtonElement => {
      const found = [...container.querySelectorAll<HTMLButtonElement>("form#checkout-pay button")].find((candidate) => candidate.textContent?.startsWith("Pay ₹"));
      if (found === undefined) throw new Error("No Pay button");
      return found;
    };

    it("opens on Pay with the lines, the total, the renewal and the GST, and sends nothing yet", async () => {
      const { startMembership } = await import("@/app/app-host/(protected)/plan/actions");
      vi.mocked(startMembership).mockClear();
      render(["managed-website", "social-media"]);
      expect(dialog().open).toBe(false);
      expect(pageButton().type).toBe("button");

      click(pageButton());

      expect(dialog().open).toBe(true);
      for (const text of ["Confirm your plan", "Social Media Management", "Due today", "₹5,998", "Includes ₹914.94 of GST at 18%", "Your first payment covers"]) {
        expect(dialog().textContent).toContain(text);
      }
      expect(startMembership).not.toHaveBeenCalled();
    });

    it("closes on Go back, and its own button submits the Pay form", () => {
      render(["managed-website"]);
      click(pageButton());
      click([...dialog().querySelectorAll("button")].find((candidate) => candidate.textContent === "Go back") as HTMLElement);
      expect(dialog().open).toBe(false);

      click(pageButton());
      const pay = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === "Pay ₹2,999");
      expect(pay?.type).toBe("submit");
      expect(pay?.getAttribute("form")).toBe("checkout-pay");
    });

    it("asks first when Enter would send the form from a billing field", () => {
      render(["managed-website"], true, billingView());
      const form = container.querySelector<HTMLFormElement>("form#checkout-pay");
      if (form === null) throw new Error("No pay form");
      const event = new Event("submit", { bubbles: true, cancelable: true });

      act(() => void form.dispatchEvent(event));

      expect(event.defaultPrevented).toBe(true);
      expect(dialog().open).toBe(true);
    });
  });

  it("shows an offer basket as it is charged: ₹1 for the first month of Social Media, the website at its price, in the page and the dialog", () => {
    render(["managed-website", "social-media"], false, null, null, { ...PRICING, neverHad: ["social-media"] });

    expect(total()).toBe("₹3,000");
    expect(container.textContent).toContain("Social Media Management, first month");
    const pay = [...container.querySelectorAll<HTMLButtonElement>("form#checkout-pay button")].find((candidate) => candidate.textContent?.startsWith("Pay "));
    click(pay as HTMLElement);
    const dialogText = container.querySelector("dialog")?.textContent ?? "";
    expect(dialogText).toContain("Social Media Management, first month");
    expect(dialogText).toContain("₹3,000");
    // From a month on the whole basket is charged at full price.
    expect(dialogText).toContain("then ₹5,998 (GST included) is taken each month");
  });

  it("does not show a total that cannot be charged when a code is applied to offer services only: no code row, the server's sentence, the dialog without the code", () => {
    const code: LedgerCode = { code: "FLAT500", months: null, stated: { kind: "amount", amountCents: 50_000 } };
    render(["social-media"], false, null, null, { ...PRICING, neverHad: ["social-media"] }, code);

    expect(total()).toBe("₹1");
    expect(container.textContent).not.toContain("Code FLAT500, ");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(CODE_NEEDS_A_PAID_SERVICE);
    const pay = [...container.querySelectorAll<HTMLButtonElement>("form#checkout-pay button")].find((candidate) => candidate.textContent?.startsWith("Pay "));
    click(pay as HTMLElement);
    expect(container.querySelector("dialog")?.textContent).not.toContain("FLAT500");
  });

  it("shows no refusal for a code that applies", () => {
    const code: LedgerCode = { code: "FLAT500", months: null, stated: { kind: "amount", amountCents: 50_000 } };
    render(["managed-website", "social-media"], false, null, null, { ...PRICING, neverHad: ["social-media"] }, code);
    expect(container.textContent).not.toContain(CODE_NEEDS_A_PAID_SERVICE);
    expect(container.textContent).toContain("Code FLAT500");
  });

  describe("paying yearly", () => {
    const YEARLY: LedgerPricing = { ...PRICING, interval: "year", neverHad: ["social-media"] };
    const radio = (name: string): HTMLButtonElement => {
      const found = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((button) => button.textContent?.startsWith(name));
      if (found === undefined) throw new Error(`No ${name} option`);
      return found;
    };

    it("offers Monthly and Yearly, with the saving named, and marks the one in force", () => {
      render(["managed-website"], false, null, null, YEARLY);
      expect(radio("Monthly").getAttribute("aria-checked")).toBe("false");
      expect(radio("Yearly").getAttribute("aria-checked")).toBe("true");
      expect(radio("Yearly").textContent).toBe("YearlySave 10%");
    });

    it("moves to the yearly address, and back, through the address so the server prices it", () => {
      routerReplace.mockClear();
      render(["managed-website"]);
      click(radio("Yearly"));
      expect(routerReplace).toHaveBeenCalledWith("/plan?services=managed-website&billing=yearly", { scroll: false });
      click(radio("Monthly"));
      expect(routerReplace).toHaveBeenCalledTimes(1);
    });

    it("prices the year, with no first-month offer, and posts the choice with Pay", () => {
      render(["managed-website", "social-media"], false, null, null, YEARLY, null, "Thu 11 Nov 2027");
      expect(total()).toBe("₹64,778");
      expect(container.textContent).toContain("Paid yearly, 10% off");
      expect(container.textContent).not.toContain("first month");
      expect(container.querySelector<HTMLInputElement>('form#checkout-pay input[name="billing"]')?.value).toBe("yearly");
      expect(container.textContent).toContain("Your payment covers 12 months, to Thu 11 Nov 2027.");
    });

    it("posts monthly for a monthly basket", () => {
      render(["managed-website"]);
      expect(container.querySelector<HTMLInputElement>('form#checkout-pay input[name="billing"]')?.value).toBe("monthly");
    });
  });

  it("is unchanged for a basket with nothing on the offer", () => {
    render(["managed-website", "social-media"], false);
    expect(total()).toBe("₹5,998");
    expect(container.textContent).not.toContain(", first month");
  });
});
