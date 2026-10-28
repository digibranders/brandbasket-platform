// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPricing } from "@/lib/checkout-ledger";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import { CheckoutLedger } from "./checkout-ledger";

vi.mock("@/app/app-host/(protected)/plan/actions", () => ({
  startMembership: vi.fn(async () => ({ status: "idle" })),
  startMembershipWithBilling: vi.fn(async () => ({ status: "idle" })),
  applyMembershipCode: vi.fn(async () => ({ status: "idle" })),
  removeMembershipCode: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ saveBillingDetailsAction: vi.fn(), lookupBillingPincodeAction: vi.fn() }));

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
  initialServices: readonly ("managed-website" | "digital-growth" | "local-seo-aeo")[],
  choosable = true,
  billingDetails: BillingDetailsView | null = null,
): void {
  act(() => {
    root.render(
      <CheckoutLedger
        tier="managed"
        initialServices={initialServices}
        choosable={choosable}
        pricing={PRICING}
        initialTermMonths={1}
        code={null}
        lapsedCode={null}
        billingDetails={billingDetails}
        paymentFailed={false}
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
    expect(chip("Managed Website").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Local SEO + AEO").getAttribute("aria-pressed")).toBe("false");
  });

  it("updates the total, the lines and the address as plans are chosen, without a network call", () => {
    render(["managed-website"]);

    click(chip("Social Media and Ads"));
    expect(total()).toBe("₹11,699");
    expect(container.textContent).toContain("10% off");
    expect(window.location.search).toBe("?services=managed-website,digital-growth");
    expect(posted()).toEqual(["managed-website", "digital-growth"]);

    click(chip("Local SEO + AEO"));
    expect(total()).toBe("₹30,398");
    expect(container.textContent).toContain("All three plans: 20% off every month.");

    click(chip("Managed Website"));
    expect(window.location.search).toBe("?services=digital-growth,local-seo-aeo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the last plan chosen, so the basket is never empty", () => {
    render(["digital-growth"]);
    click(chip("Social Media and Ads"));
    expect(chip("Social Media and Ads").getAttribute("aria-pressed")).toBe("true");
    expect(total()).toBe("₹9,999");
  });

  it("lists what you get for the chosen plans only", () => {
    render(["managed-website"]);
    expect(container.textContent).toContain("A website of up to 10 pages, mobile-friendly");
    expect(container.textContent).not.toContain("Keyword research");
    click(chip("Local SEO + AEO"));
    expect(container.textContent).toContain("Keyword research");
  });

  it("offers no choice when the services are fixed", () => {
    render(["managed-website", "digital-growth"], false);
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
    expect(total()).toBe("₹11,699");
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
});
