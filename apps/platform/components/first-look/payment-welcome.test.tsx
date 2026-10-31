// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function render(services: readonly ("website" | "social" | "search")[]): void {
  act(() => root.render(<PaymentWelcome services={services} />));
}

const dialog = (): HTMLDialogElement => {
  const found = container.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
};

describe("PaymentWelcome", () => {
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
});
