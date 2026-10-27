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

it("says what the call is, then the day and time, and keeps the reason and the note in a closed disclosure under the times", async () => {
  await render(sheet());
  await click("Book a call");
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  const text = dialog.textContent ?? "";
  const order = ["Book a call", "30 minutes on video. The link comes by email and in a calendar invite.", "Pick a day, times in India", "Morning", "Afternoon", "What is it about? (optional)", "Pick a time"];
  expect(order.map((part) => text.indexOf(part))).toEqual([...order.map((part) => text.indexOf(part))].sort((a, b) => a - b));
  expect(order.every((part) => text.includes(part))).toBe(true);
  expect(text.match(/30 minutes on video/g)).toHaveLength(1);
  const disclosure = dialog.querySelector("details") as HTMLDetailsElement;
  expect(disclosure.open).toBe(false);
  expect(disclosure.querySelector("summary")?.textContent).toBe("What is it about? (optional)");
  expect(disclosure.querySelectorAll('input[name="call-reason"]')).toHaveLength(OPTIONS.length);
  expect(disclosure.querySelector("#call-note")).not.toBeNull();
  expect((disclosure.querySelector('input[value="website"]') as HTMLInputElement).checked).toBe(true);
});

it("sends the default reason and an empty note when the disclosure was never opened", async () => {
  mocks.bookCallAction.mockResolvedValue({ ok: true });
  await render(sheet());
  await click("Book a call");
  await click("10:00");
  await click("Book Wed 2 Dec, 10:00");
  expect(mocks.bookCallAction).toHaveBeenCalledWith({ startIso: SLOTS[0], timeZone: "Asia/Kolkata", reason: "website", note: "", replaceId: null });
});

it("puts the times under Morning and Afternoon, and marks the picked one with a check", async () => {
  await render(sheet());
  await click("Book a call");
  const group = (name: string): HTMLElement => container.querySelector(`[role="group"][aria-label="Time"] [role="group"][aria-labelledby="slot-${name}"]`) as HTMLElement;
  expect([...group("morning").querySelectorAll("button")].map((item) => item.textContent)).toEqual(["10:00"]);
  expect([...group("afternoon").querySelectorAll("button")].map((item) => item.textContent)).toEqual(["14:00"]);
  expect(button("14:00").querySelector("svg")).toBeNull();
  await click("14:00");
  expect(button("14:00").querySelector("svg")).not.toBeNull();
  expect(button("14:00").getAttribute("aria-pressed")).toBe("true");
});

it("has no fixed width inside the sheet that could be wider than a phone", async () => {
  await render(sheet());
  await click("Book a call");
  const dialog = container.querySelector("dialog") as HTMLDialogElement;
  // The sheet is at most 26rem and never wider than the screen; nothing inside may force it wider.
  expect(dialog.className).toContain("w-[min(26rem,100%)]");
  const fixedWidth = /(^|\s)(?:min-|max-)?w-(?:(?!0(?:\s|$))\d|\[(?!min\(|100%))/;
  const offenders = [...dialog.querySelectorAll("*")].map((element) => element.getAttribute("class") ?? "").filter((value) => fixedWidth.test(value.replace(/\bmax-w-none\b/, "")));
  // The day buttons are the one fixed width: they sit in a strip that scrolls on its own.
  const strip = dialog.querySelector('[role="group"][aria-label="Day"]') as HTMLElement;
  expect(strip.className).toContain("overflow-x-auto");
  expect(offenders.every((value) => value.includes("w-[4.25rem]") && value.includes("shrink-0"))).toBe(true);
  expect(dialog.querySelectorAll("[style]")).toHaveLength(0);
  // The times fill whatever room there is: three across on a phone, four on the full sheet.
  expect(dialog.querySelector('[aria-labelledby="slot-morning"] > div')?.className).toContain("grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]");
});
