// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountBar } from "@brandbasket/shared/ui/panel/account-bar";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children),
}));

let root: Root;
let container: HTMLDivElement;

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

async function openMenu(helpHref: string): Promise<readonly HTMLElement[]> {
  await act(async () =>
    root.render(
      createElement(AccountBar, {
        account: { name: "Priya Test", email: "priya@example.test", href: "/settings" },
        panel: { notices: [], liveWebsiteUrl: "https://clinic.example", siteStatus: { kind: "not_launched" } },
        signOut: async () => {},
        dark: true,
        docsUrl: "https://brandbasket.in/faq",
        helpHref,
      }),
    ),
  );
  const trigger = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Account menu"));
  if (trigger === undefined) throw new Error("Missing the account menu button");
  await act(async () => trigger.click());
  return [...container.querySelectorAll<HTMLElement>("[role=menuitem]")];
}

it("offers what the spec names, in plain words: Settings, What's new, Help, Docs and Sign out", async () => {
  const labels = (await openMenu(`${ASK_FOR_A_CHANGE_PATH}?kind=other`)).map((item) => item.textContent?.trim());
  expect(labels).toEqual(["Settings", "Home page", "What’s new", "Help", "Docs", "Sign out"]);
});

it("no longer offers Feedback, My requests, Changelog or Log out, which opened the old support window", async () => {
  const text = (await openMenu(`${ASK_FOR_A_CHANGE_PATH}?kind=other`)).map((item) => item.textContent).join("|");
  for (const gone of ["Feedback", "My requests", "Changelog", "Log out"]) expect(text).not.toContain(gone);
});

it("sends Help to the Ask for a change form, as a link and not a button that opens a window", async () => {
  const items = await openMenu(`${ASK_FOR_A_CHANGE_PATH}?kind=other`);
  const help = items.find((item) => item.textContent?.trim() === "Help");
  expect(help?.tagName).toBe("A");
  expect(help?.getAttribute("href")).toBe("/requests/new?kind=other");
  expect(help?.getAttribute("target")).toBeNull();
});

it("sends Help to mail for a shell with nowhere to ask", async () => {
  const items = await openMenu("mailto:help@example.test?subject=Help");
  const help = items.find((item) => item.textContent?.trim() === "Help");
  expect(help?.getAttribute("href")).toBe("mailto:help@example.test?subject=Help");
});
