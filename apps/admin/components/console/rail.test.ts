// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/support/errors" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: vi.fn() }) }));

import { railFor } from "@/lib/console-rail";
import { Rail } from "./rail";

let root: Root;
let container: HTMLDivElement;
const logo = { name: "Brandbasket", onLight: "/brand/brandbasket-logo-light.svg", onDark: "/brand/brandbasket-logo-dark.svg", width: 160, height: 32 };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderRail(role: "support" | "admin", counts: Record<string, number>): Promise<void> {
  await act(async () =>
    root.render(createElement(Rail, { sections: railFor(role), counts, userName: "Riya Kapoor", role, signOut: async () => undefined, logo })),
  );
}

it("marks the open page, longest address first", async () => {
  mocks.pathname = "/support/errors";
  await renderRail("admin", {});
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Errors");
});

it("shows a count only when something is waiting", async () => {
  mocks.pathname = "/";
  await renderRail("admin", { leads: 6, requests: 0 });
  const enquiries = container.querySelector('a[href="/leads"]');
  const requests = container.querySelector('a[href="/support"]');
  expect(enquiries?.textContent).toBe("Enquiries6");
  expect(requests?.textContent).toBe("Requests");
});

it("shows the signed-in person, their role and Sign out", async () => {
  await renderRail("support", {});
  expect(container.textContent).toContain("Riya Kapoor");
  expect(container.textContent).toContain("Support");
  expect(container.querySelector('button[aria-label="Sign out"]')).not.toBeNull();
  expect(container.querySelector('a[href="/access-log"]')).toBeNull();
});
