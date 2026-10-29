// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function render(services: readonly ("website" | "social" | "search")[]): void {
  act(() => root.render(<PaymentWelcome services={services} />));
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
});
