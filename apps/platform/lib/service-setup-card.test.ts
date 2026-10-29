import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/setup-actions", () => ({ saveSetupItemAction: vi.fn() }));

import { ServiceSetupCard } from "@/components/setup/service-setup-card";
import type { SetupAsk } from "@/lib/setup-asks";

const ask = (setup: SetupAsk["setup"], label: string): SetupAsk => ({ key: setup, setup, label, hint: "So we can start", saved: undefined });
const render = (asks: readonly SetupAsk[]): string => renderToStaticMarkup(createElement(ServiceSetupCard, { asks })).replaceAll("<!-- -->", "");

it("draws nothing when nothing is needed", () => {
  expect(render([])).toBe("");
});

it("asks for one thing with its own form, under one heading and one id", () => {
  const html = render([ask("accounts", "Your Instagram and Facebook pages")]);
  expect(html).toContain("We need one thing from you");
  expect(html).toContain('id="setup"');
  expect(html).toContain("Your Instagram and Facebook pages");
  expect(html).toContain('name="key" value="accounts"');
  expect(html.match(/<form/g)).toHaveLength(1);
});

it("says a few things when there are several, with a form for each", () => {
  const html = render([ask("accounts", "Your pages"), ask("budget", "Your ad budget")]);
  expect(html).toContain("We need a few things from you");
  expect(html.match(/<form/g)).toHaveLength(2);
});

it("never uses a dash in what it says", () => {
  expect(render([ask("budget", "Your ad budget")]).replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});
