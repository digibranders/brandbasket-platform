// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { GlobalSearch } from "./global-search";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(element: ReactElement): Promise<void> {
  await act(async () => root.render(element));
}
async function type(value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search everything"]');
  if (input === null) throw new Error("Missing the search field");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function wait(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
  await act(async () => {});
}

const HITS = [
  { kind: "client", label: "Sai Dental Care", sub: "Priya Sharma", href: "/clients/b1" },
  { kind: "request", label: "Change the opening hours", sub: "R-0152", href: "/support/t1" },
];

it("searches after a pause, by POST, and lists the results by kind", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: HITS }) });
  vi.stubGlobal("fetch", fetchMock);
  await render(createElement(GlobalSearch, { open: false, onClose: () => undefined }));
  await type("sai");
  expect(fetchMock).not.toHaveBeenCalled();
  await wait(200);
  expect(fetchMock).toHaveBeenCalledWith("/search", expect.objectContaining({ method: "POST", body: JSON.stringify({ q: "sai" }) }));
  expect(container.textContent).toContain("Clients");
  expect(container.textContent).toContain("Sai Dental Care");
  expect(container.textContent).toContain("Requests");
  expect(container.querySelector('a[href="/clients/b1"]')).not.toBeNull();
});

it("does not search for a single letter", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await render(createElement(GlobalSearch, { open: false, onClose: () => undefined }));
  await type("s");
  await wait(500);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("says so when nothing matches, and when search fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: [] }) }));
  await render(createElement(GlobalSearch, { open: false, onClose: () => undefined }));
  await type("zz");
  await wait(200);
  expect(container.textContent).toContain("Nothing matches that.");

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
  await type("zzz");
  await wait(200);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Search is not working right now. Try again.");
});
