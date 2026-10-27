import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/requests/actions", () => ({ askForChangeAction: vi.fn() }));

import type { ChangeKind } from "@brandbasket/db/change-states";
import { AskForm } from "@/components/requests/ask-form";
import { DARK_BUTTON } from "@/components/v2/classes";
import { aboutLine, kindOptions } from "@/lib/requests/form";

function render(services: Parameters<typeof kindOptions>[0], extra: { defaultKind?: ChangeKind; defaultBody?: string } = {}): string {
  return renderToStaticMarkup(createElement(AskForm, { options: kindOptions(services), submissionKey: "ask-key-12345678", ...extra })).replaceAll("<!-- -->", "");
}

it("asks what it is about, with only the services the customer has, then what to change, and has one dark button", () => {
  const html = render(["website", "social"]);
  expect(html).toContain("What is it about?");
  for (const label of ["Website", "Social &amp; Ads", "Billing", "Something else"]) expect(html).toContain(label);
  expect(html).not.toContain(">Search<");
  expect(html).toContain("What do you want changed?");
  expect(html).toContain('name="submissionKey" value="ask-key-12345678"');
  expect(html.split(DARK_BUTTON).length - 1).toBe(1);
  expect(html).toContain(">Send</button>");
});

it("asks which page only for a website change, which is the first choice for a customer with a website", () => {
  expect(render(["website"])).toContain("Which page? (optional)");
  expect(render([])).not.toContain("Which page?");
});

it("starts on the first choice and offers up to three screenshots", () => {
  const html = render(["social"]);
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  expect(radios.filter((radio) => radio.includes('checked=""'))).toHaveLength(1);
  expect(radios.find((radio) => radio.includes('checked=""'))).toContain('value="social"');
  expect(html).toContain("0/3");
  expect(html).toContain("or paste screenshots from clipboard");
});

it("starts with the post's line and the Social kind selected when it is opened from a post", () => {
  const html = render(["website", "social"], { defaultKind: "social", defaultBody: aboutLine("Year-end check-up", "2026-12-01") });
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  expect(radios.find((radio) => radio.includes('checked=""'))).toContain('value="social"');
  expect(html).toContain('About the post &quot;Year-end check-up&quot; (Tue 1 Dec): </textarea>');
});

it("changes nothing when opened with no post", () => {
  const html = render(["website", "social"]);
  expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  expect(html.match(/<input type="radio"[^>]*>/g)?.find((radio) => radio.includes('checked=""'))).toContain('value="website"');
});

it("never uses a dash in what it says", () => {
  expect(render(["website", "social", "search"]).replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});
