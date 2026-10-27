// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cancelCallAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/app-host/(protected)/requests/calls/actions", () => ({ cancelCallAction: mocks.cancelCallAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { CancelCallButton } from "@/components/calls/cancel-call-button";

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
}
async function click(text: string): Promise<void> {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (found === undefined) throw new Error(`Missing button ${text}`);
  await act(async () => found.click());
  await act(async () => {});
}

it("asks first, and cancels nothing until the customer says yes", async () => {
  await render(createElement(CancelCallButton, { callId: "call-1" }));
  await click("Cancel call");
  expect(container.textContent).toContain("Cancel this call?");
  expect(mocks.cancelCallAction).not.toHaveBeenCalled();
  await click("Keep it");
  expect(container.textContent).toBe("Cancel call");
});

it("cancels the call and refreshes the page", async () => {
  mocks.cancelCallAction.mockResolvedValue({ ok: true });
  await render(createElement(CancelCallButton, { callId: "call-1" }));
  await click("Cancel call");
  await click("Yes, cancel");
  expect(mocks.cancelCallAction).toHaveBeenCalledWith("call-1");
  expect(mocks.refresh).toHaveBeenCalled();
});

it("refreshes the page for a call that was already gone, and says so when the cancel failed", async () => {
  mocks.cancelCallAction.mockResolvedValueOnce({ ok: false, reason: "gone" });
  await render(createElement(CancelCallButton, { callId: "call-1" }));
  await click("Cancel call");
  await click("Yes, cancel");
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  mocks.cancelCallAction.mockResolvedValueOnce({ ok: false, reason: "failed" });
  await click("Yes, cancel");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("We could not cancel that call. Please try again.");
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
