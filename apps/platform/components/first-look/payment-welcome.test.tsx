// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseEvent } from "@/lib/purchase-event";
import { PaymentWelcome } from "./payment-welcome";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/panel/brand-provider", () => ({ useBrand: () => ({ shortName: "Brandbasket" }) }));
vi.mock("@/components/first-look/fire-poppers", () => ({ firePoppers: vi.fn(() => () => undefined) }));

const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  replace.mockClear();
  // happy-dom has no modal dialog: stand in for the two calls the hook makes.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    this.removeAttribute("open");
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(services: readonly ("website" | "social" | "search")[], purchase: PurchaseEvent | null = null): void {
  act(() => root.render(<PaymentWelcome services={services} purchase={purchase} />));
}

const dialog = (): HTMLDialogElement => {
  const found = container.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
};

describe("PaymentWelcome", () => {
  it("opens when the address says a payment just opened the plan, and lists the services", () => {
    search = "welcome=1";
    render(["website", "search"]);
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(dialog().textContent).toContain("Welcome to Brandbasket.");
    expect(dialog().textContent).toContain("Website");
    expect(dialog().textContent).toContain("Local SEO + AEO");
    expect(dialog().textContent).not.toContain("Social & Ads");
  });

  it("stays closed on any other visit", () => {
    search = "";
    render(["website"]);
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("takes the welcome off the address when closed, so a refresh never replays it", () => {
    search = "welcome=1";
    render(["website"]);
    const button = [...dialog().querySelectorAll("button")].find((each) => each.textContent === "Let’s go");
    if (button === undefined) throw new Error("No close button");
    act(() => button.click());
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  describe("telling Tag Manager about the purchase", () => {
    const PURCHASE: PurchaseEvent = { transactionId: "pay_Abc123", value: 2541.54, currency: "INR" };
    const win = window as { dataLayer?: unknown[] };

    beforeEach(() => {
      win.dataLayer = [];
      window.sessionStorage.clear();
      window.localStorage.clear();
    });

    afterEach(() => {
      delete win.dataLayer;
    });

    it("pushes the purchase once when the welcome opens, and not again when it opens again", () => {
      search = "welcome=1";
      render(["website"], PURCHASE);
      expect(win.dataLayer).toHaveLength(2);
      expect(win.dataLayer?.[1]).toMatchObject({ event: "purchase", ecommerce: { transaction_id: "pay_Abc123", currency: "INR" } });
      act(() => root.unmount());
      root = createRoot(container);
      render(["website"], PURCHASE);
      expect(win.dataLayer).toHaveLength(2);
    });

    it("pushes nothing on a visit that is not the welcome, or when there is no purchase to report", () => {
      search = "";
      render(["website"], PURCHASE);
      search = "welcome=1";
      act(() => root.unmount());
      root = createRoot(container);
      render(["website"], null);
      expect(win.dataLayer).toHaveLength(0);
    });
  });
});
