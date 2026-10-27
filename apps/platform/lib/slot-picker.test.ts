// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadCallSlots: vi.fn(), book: vi.fn(), onBooked: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: mocks.loadCallSlots }));

import { SlotPicker } from "@/components/calls/slot-picker";

// Wed 2 Dec 2026, 10:00 and 14:00 in India; then 10:00 on Thu 3 Dec.
const SLOTS = ["2026-12-02T04:30:00.000Z", "2026-12-02T08:30:00.000Z", "2026-12-03T04:30:00.000Z"];

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
const picker = (extra: Partial<Parameters<typeof SlotPicker>[0]> = {}) =>
  createElement(SlotPicker, { bookingUrl: null, book: mocks.book, onBooked: mocks.onBooked, ...extra });

it("books the picked time and tells its owner, and not before a time is picked", async () => {
  mocks.book.mockResolvedValue({ ok: true });
  await render(picker());
  expect(button("Pick a time").disabled).toBe(true);
  await click("14:00");
  await click("Book Wed 2 Dec, 14:00");
  expect(mocks.book).toHaveBeenCalledWith(SLOTS[1]);
  expect(mocks.onBooked).toHaveBeenCalledTimes(1);
});

it("says a fourth call is not allowed, and keeps the picked time", async () => {
  mocks.book.mockResolvedValue({ ok: false, reason: "limit" });
  await render(picker());
  await click("10:00");
  await click("Book Wed 2 Dec, 10:00");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("You already have 3 calls booked. Change or cancel one first.");
  expect(button("10:00").getAttribute("aria-pressed")).toBe("true");
  expect(mocks.onBooked).not.toHaveBeenCalled();
});

it("shows a sentence the booking sent with its refusal in place of the standard one", async () => {
  mocks.book.mockResolvedValue({ ok: false, reason: "failed", message: "Choose what the call is about." });
  await render(picker());
  await click("10:00");
  await click("Book Wed 2 Dec, 10:00");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Choose what the call is about.");
});

it("draws the note under the button for the picked time", async () => {
  await render(picker({ note: (slot) => createElement("p", { "data-testid": "note" }, slot === null ? "nothing picked" : `picked ${slot}`) }));
  expect(container.querySelector('[data-testid="note"]')?.textContent).toBe("nothing picked");
  await click("14:00");
  expect(container.querySelector('[data-testid="note"]')?.textContent).toBe(`picked ${SLOTS[1]}`);
});
