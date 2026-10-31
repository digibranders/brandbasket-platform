// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseEvent } from "@/lib/purchase-event";
import { PaymentWelcome } from "./payment-welcome";
import { firePoppers } from "./fire-poppers";

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
  search = "";
  // happy-dom has no modal dialog: stand in for the two calls the hook makes.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
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
  it("starts the artwork entrance only after its shared image has loaded", () => {
    search = "welcome=1";
    render(["website"]);
    const art = dialog().querySelector('svg[viewBox="0 0 1536 1024"]');
    expect(art?.getAttribute("data-ready")).toBe("false");
    const texture = art?.querySelector("defs image");
    expect(texture).not.toBeNull();
    act(() => texture?.dispatchEvent(new Event("load")));
    expect(art?.getAttribute("data-ready")).toBe("true");
  });

  it("renders separately clipped gift, ribbon and paper pieces instead of two flattened image halves", () => {
    search = "welcome=1";
    render(["website"]);
    const art = dialog().querySelector('svg[viewBox="0 0 1536 1024"]');
    expect(art).not.toBeNull();
    expect(art?.querySelector('[data-part="lid"]')).not.toBeNull();
    expect(art?.querySelector('[data-part="box"]')).not.toBeNull();
    expect(art?.querySelectorAll('[data-part="ribbon"]').length).toBeGreaterThan(1);
    expect(art?.querySelectorAll('[data-part="paper"]').length).toBeGreaterThan(10);
    const clips = [...art?.querySelectorAll("clipPath") ?? []].map((clip) => clip.id);
    expect(new Set(clips).size).toBe(clips.length);
  });

  it("places initial focus on the welcome heading while keeping the close control available", () => {
    search = "welcome=1";
    render(["website"]);
    expect(document.activeElement).toBe(dialog().querySelector("h2"));
    expect(dialog().querySelector('button[aria-label="Close welcome"]')).not.toBeNull();
  });

  it("explicitly confirms payment and describes the celebration accessibly", () => {
    search = "welcome=1";
    render(["website"]);
    const descriptionId = dialog().getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe("Payment successful");
    expect(dialog().textContent).toContain("Your next chapter starts here.");
  });

  it("has an accessible close control that dismisses immediately and preserves other query parameters", () => {
    search = "source=checkout&welcome=1";
    render(["website"]);
    const closeButton = dialog().querySelector<HTMLButtonElement>('button[aria-label="Close welcome"]');
    expect(closeButton).not.toBeNull();
    act(() => closeButton?.click());
    expect(dialog().open).toBe(false);
    expect(replace).toHaveBeenCalledWith("/?source=checkout", { scroll: false });
  });

  it("removes the welcome parameter when Escape closes the native dialog", () => {
    search = "welcome=1";
    render(["website"]);
    act(() => dialog().close());
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("does not show an empty services section", () => {
    search = "welcome=1";
    render([]);
    expect(dialog().querySelector("ul")).toBeNull();
    expect(dialog().textContent).not.toContain("Now yours");
  });

  it("stops the celebration when the welcome parameter disappears", () => {
    const stop = vi.fn();
    vi.mocked(firePoppers).mockReturnValueOnce(stop);
    search = "welcome=1";
    render(["website"]);
    search = "";
    render(["website"]);
    expect(stop).toHaveBeenCalledOnce();
    expect(dialog().open).toBe(false);
  });

  it("stops drawing immediately when the dialog is dismissed", () => {
    const stop = vi.fn();
    vi.mocked(firePoppers).mockReturnValueOnce(stop);
    search = "welcome=1";
    render(["website"]);
    act(() => dialog().close());
    expect(stop).toHaveBeenCalledOnce();
  });

  it("shows all purchased services in order", () => {
    search = "welcome=1";
    render(["website", "social", "search"]);
    expect([...dialog().querySelectorAll("li")].map((row) => row.textContent)).toEqual([
      "Website", "Social & Ads", "Local SEO + AEO",
    ]);
  });

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
    const button = [...dialog().querySelectorAll("button")].find((each) => each.textContent?.trim() === "Let’s go");
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
