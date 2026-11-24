// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RECENT_STORAGE_KEY } from "@/lib/console-command-items";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { GlobalSearch } from "./global-search";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  window.localStorage.clear();
  mocks.push.mockClear();
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
function input(): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (field === null) throw new Error("The command bar is not open");
  return field;
}
async function type(value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
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

it("opens with Go to and Actions, focus in the field and the first option active", async () => {
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  expect(document.activeElement).toBe(input());
  expect(document.body.textContent).toContain("Go to");
  expect(document.body.textContent).toContain("Actions");
  expect(input().getAttribute("aria-activedescendant")).not.toBeNull();
});

it("opens on Ctrl K and on slash, but not on slash while typing in a field", async () => {
  const onShortcut = vi.fn();
  await render(createElement(GlobalSearch, { open: false, onClose: () => undefined, onShortcut }));
  await press(document.body, "k", { ctrlKey: true });
  expect(onShortcut).toHaveBeenCalledTimes(1);
  await press(document.body, "/");
  expect(onShortcut).toHaveBeenCalledTimes(2);
  const field = document.createElement("input");
  document.body.append(field);
  await press(field, "/");
  expect(onShortcut).toHaveBeenCalledTimes(2);
  field.remove();
});

it("does not listen for keys in the phone bar's instance and renders nothing while closed", async () => {
  const onClose = vi.fn();
  await render(createElement(GlobalSearch, { open: false, onClose }));
  await press(document.body, "k", { ctrlKey: true });
  await press(document.body, "/");
  expect(document.querySelector("dialog")).toBeNull();
});

it("searches after a pause, by POST, lists results by kind and opens the active one with Enter", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: HITS }) });
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  await render(createElement(GlobalSearch, { open: true, onClose, onShortcut: () => undefined }));
  await type("sai");
  expect(fetchMock).not.toHaveBeenCalled();
  await wait(150);
  expect(fetchMock).toHaveBeenCalledWith("/search", expect.objectContaining({ method: "POST", body: JSON.stringify({ q: "sai" }) }));
  expect(document.body.textContent).toContain("Clients");
  expect(document.body.textContent).toContain("Requests");
  const options = [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent);
  const at = options.findIndex((text) => text?.includes("Change the opening hours"));
  expect(at).toBeGreaterThan(0);
  for (let step = 0; step < at; step += 1) await press(input(), "ArrowDown");
  await press(input(), "Enter");
  expect(mocks.push).toHaveBeenCalledWith("/support/t1");
  expect(onClose).toHaveBeenCalled();
});

it("keeps what was opened in this browser, labels only, five at most", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: HITS }) }));
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  await type("sai");
  await wait(150);
  const at = [...document.querySelectorAll('[role="option"]')].findIndex((option) => option.textContent?.includes("Sai Dental Care"));
  for (let step = 0; step < at; step += 1) await press(input(), "ArrowDown");
  await press(input(), "Enter");
  expect(JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]")).toEqual([{ href: "/clients/b1", title: "Sai Dental Care", subtitle: "Priya Sharma" }]);
});

it("shows Recent on an empty field", async () => {
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify([{ href: "/clients/b1", title: "Sai Dental Care", subtitle: "Priya Sharma" }]));
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  expect(document.body.textContent).toContain("Recent");
  expect(document.body.textContent).toContain("Sai Dental Care");
});

it("does not search for a single letter", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  await type("s");
  await wait(500);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("with # lists request references only", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: HITS }) }));
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  await type("#");
  await type("r-01");
  await wait(150);
  expect(document.body.textContent).toContain("Change the opening hours");
  expect(document.body.textContent).not.toContain("Sai Dental Care");
});

it("says nothing matches and offers Add enquiry and New request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: [] }) }));
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  await type("zzqx");
  await wait(150);
  expect(document.body.textContent).toContain('No results for "zzqx".');
  expect(document.body.textContent).toContain("Add enquiry");
  expect(document.body.textContent).toContain("New request");
});

it("on a failed search says so, keeps Go to usable and retries", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }).mockResolvedValue({ ok: true, json: async () => ({ hits: HITS }) });
  vi.stubGlobal("fetch", fetchMock);
  await render(createElement(GlobalSearch, { open: true, onClose: () => undefined, onShortcut: () => undefined }));
  await type("pay");
  await wait(150);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Search did not load");
  expect(document.body.textContent).toContain("Money: Payments");
  const retry = [...document.querySelectorAll("button")].find((button) => button.textContent === "Try again");
  await act(async () => retry?.click());
  await wait(150);
  expect(document.body.textContent).toContain("Sai Dental Care");
});

it("Escape clears the text, then closes", async () => {
  const onClose = vi.fn();
  await render(createElement(GlobalSearch, { open: true, onClose, onShortcut: () => undefined }));
  await type("pay");
  await press(document, "Escape");
  expect(input().value).toBe("");
  expect(onClose).not.toHaveBeenCalled();
  await press(document, "Escape");
  expect(onClose).toHaveBeenCalled();
});
