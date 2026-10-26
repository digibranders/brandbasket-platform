// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadCallSlots: vi.fn(), bookCallSlot: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: mocks.loadCallSlots, bookCallSlot: mocks.bookCallSlot }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { KickoffPicker } from "@/components/first-look/kickoff-picker";

// Tue 27 Oct 2026, 10:00 and 14:00 in India; then 10:00 on Wed 28, Thu 29 and Fri 30.
const SLOTS = ["2026-10-27T04:30:00.000Z", "2026-10-27T08:30:00.000Z", "2026-10-28T04:30:00.000Z", "2026-10-29T04:30:00.000Z", "2026-10-30T04:30:00.000Z"];

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
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

it("books the picked time in India's time zone, says when the site can be live, and refreshes", async () => {
  mocks.loadCallSlots.mockResolvedValue({ status: "ok", slots: SLOTS });
  mocks.bookCallSlot.mockResolvedValue({ ok: true, startsAtIso: SLOTS[1], endsAtIso: "2026-10-27T09:00:00.000Z" });
  await render(createElement(KickoffPicker, { showLiveBy: true, bookingUrl: null }));

  expect(button("More days")).toBeDefined();
  expect(button("Pick a time").disabled).toBe(true);
  await click("14:00");
  expect(container.textContent).toContain("your website can be live by Thu 5 Nov");
  await click("Book Tue 27 Oct, 14:00");
  expect(mocks.bookCallSlot).toHaveBeenCalledWith(SLOTS[1], "Asia/Kolkata");
  expect(mocks.refresh).toHaveBeenCalled();
});

it("says so when the picked time was just taken", async () => {
  mocks.loadCallSlots.mockResolvedValue({ status: "ok", slots: SLOTS });
  mocks.bookCallSlot.mockResolvedValue({ ok: false, reason: "taken" });
  await render(createElement(KickoffPicker, { showLiveBy: false, bookingUrl: null }));
  await click("10:00");
  await click("Book Tue 27 Oct, 10:00");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("That time was just taken. Please pick another.");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("offers the booking page when the times cannot be listed here", async () => {
  mocks.loadCallSlots.mockResolvedValue({ status: "unavailable" });
  await render(createElement(KickoffPicker, { showLiveBy: true, bookingUrl: "https://cal.com/brandbasket/kickoff" }));
  expect(container.querySelector("a")?.getAttribute("href")).toBe("https://cal.com/brandbasket/kickoff");
});
