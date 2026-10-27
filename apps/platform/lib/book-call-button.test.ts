// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadCallSlots: vi.fn(), bookCallAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: mocks.loadCallSlots }));
vi.mock("@/app/app-host/(protected)/requests/calls/actions", () => ({ bookCallAction: mocks.bookCallAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { BookCallButton } from "@/components/calls/book-call-button";

// Wed 2 Dec 2026, 10:00 and 14:00 in India.
const SLOTS = ["2026-12-02T04:30:00.000Z", "2026-12-02T08:30:00.000Z"];
const OPTIONS = [
  { value: "website", label: "Website" },
  { value: "social", label: "Social & Ads" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Something else" },
] as const;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
  mocks.loadCallSlots.mockResolvedValue({ status: "ok", slots: SLOTS });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(element: ReactElement): Promise<void> {
  await act(async () => root.render(element));
  await act(async () => {});
}
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (found === undefined) throw new Error(`Missing button ${text}`);
  return found;
}
async function click(text: string): Promise<void> {
  await act(async () => button(text).click());
  await act(async () => {});
}
const sheet = (extra: Record<string, unknown> = {}) => createElement(BookCallButton, { options: OPTIONS, bookingUrl: null, canBook: true, ...extra });

it("loads no times until the sheet is opened", async () => {
  await render(sheet());
  expect(mocks.loadCallSlots).not.toHaveBeenCalled();
  expect(container.querySelector("#call-note")).toBeNull();
});

it("books the picked time with the reason and the note the customer chose, and refreshes the page", async () => {
  mocks.bookCallAction.mockResolvedValue({ ok: true });
  await render(sheet());
  await click("Book a call");
  expect(container.querySelector("h2")?.textContent).toBe("Book a call");
  await act(async () => (container.querySelectorAll<HTMLInputElement>('input[name="call-reason"]')[1] as HTMLInputElement).click());
  const note = container.querySelector<HTMLTextAreaElement>("#call-note") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(note, "Ads for braces in January.");
    note.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("14:00");
  await click("Book Wed 2 Dec, 14:00");
  expect(mocks.bookCallAction).toHaveBeenCalledWith({ startIso: SLOTS[1], timeZone: "Asia/Kolkata", reason: "social", note: "Ads for braces in January.", replaceId: null });
  expect(mocks.refresh).toHaveBeenCalled();
  expect(container.querySelector("#call-note")).toBeNull();
});

it("starts from the reason and note it was given, and names the call it replaces", async () => {
  mocks.bookCallAction.mockResolvedValue({ ok: true });
  await render(sheet({ defaultReason: "billing", defaultNote: "About my invoice", replacing: { id: "call-1", when: "Wed 2 Dec, 14:00" } }));
  await click("Book a call");
  expect(container.querySelector("h2")?.textContent).toBe("Change your call");
  expect(container.textContent).toContain("Your call is booked for Wed 2 Dec, 14:00.");
  expect((container.querySelector('input[value="billing"]') as HTMLInputElement).checked).toBe(true);
  expect((container.querySelector("#call-note") as HTMLTextAreaElement).value).toBe("About my invoice");
  await click("10:00");
  await click("Book Wed 2 Dec, 10:00");
  expect(mocks.bookCallAction).toHaveBeenCalledWith(expect.objectContaining({ reason: "billing", note: "About my invoice", replaceId: "call-1" }));
});

it("shows the sentence the server gave when it refuses the reason or the note", async () => {
  mocks.bookCallAction.mockResolvedValue({ ok: false, reason: "invalid", message: "Keep the note to 500 characters or fewer." });
  await render(sheet());
  await click("Book a call");
  await click("10:00");
  await click("Book Wed 2 Dec, 10:00");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Keep the note to 500 characters or fewer.");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("offers only the booking page to an account that cannot be sent an invitation", async () => {
  await render(sheet({ canBook: false, bookingUrl: "https://cal.com/brandbasket/call" }));
  await click("Book a call");
  expect(container.textContent).toContain("Add an email address in Settings to book here, or pick a time on our booking page.");
  expect(container.querySelector("a")?.getAttribute("href")).toBe("https://cal.com/brandbasket/call");
  expect(mocks.loadCallSlots).not.toHaveBeenCalled();
});
