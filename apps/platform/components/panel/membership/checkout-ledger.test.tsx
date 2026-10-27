// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPricing } from "@/lib/checkout-ledger";
import { CheckoutLedger } from "./checkout-ledger";

vi.mock("@/app/app-host/(protected)/plan/actions", () => ({
  startMembership: vi.fn(async () => ({ status: "idle" })),
  applyMembershipCode: vi.fn(async () => ({ status: "idle" })),
  removeMembershipCode: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ saveBillingDetailsAction: vi.fn() }));

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

function render(initialServices: readonly ("managed-website" | "digital-growth" | "local-seo-aeo")[], choosable = true): void {
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
        billingDetails={null}
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
});
