import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/requests/actions", () => ({ askForChangeAction: vi.fn() }));

import { AskForm } from "@/components/requests/ask-form";
import { DARK_BUTTON } from "@/components/v2/classes";
import { aboutLine, intentOptions, type RequestIntent } from "@/lib/requests/form";

function render(services: Parameters<typeof intentOptions>[0], extra: { defaultIntent?: RequestIntent; defaultBody?: string; includedLine?: string | null } = {}): string {
  return renderToStaticMarkup(createElement(AskForm, { options: intentOptions(services), submissionKey: "ask-key-12345678", ...extra })).replaceAll("<!-- -->", "");
}

it("asks what they would like to do, offering a service only when the customer has it, then the details, and has one dark button", () => {
  const html = render(["website", "social"]);
  expect(html).toContain("What would you like to do?");
  for (const label of ["Change my website", "Ask about my social media or ads", "Ask a question", "Send us information", "Something is not working", "Billing or my plan"]) expect(html).toContain(label);
  expect(html).not.toContain("Local SEO + AEO");
  expect(html).toContain("What do you want changed?");
  expect(html).toContain('name="submissionKey" value="ask-key-12345678"');
  expect(html.split(DARK_BUTTON).length - 1).toBe(1);
  expect(html).toContain(">Send</button>");
});

it("asks which page, and shows the included edits, only for a website change, which is the first choice for a customer with a website", () => {
  const included = "This month: 1 of 2 included edits used.";
  expect(render(["website"], { includedLine: included })).toContain(included);
  expect(render(["website"])).toContain("Which page? (optional)");
  expect(render([])).not.toContain("Which page?");
  expect(render(["website"], { defaultIntent: "question", includedLine: included })).not.toContain(included);
});

it("words the details question for what they chose", () => {
  expect(render(["website"], { defaultIntent: "not_working" })).toContain("What is not working?");
  expect(render(["website"], { defaultIntent: "send_info" })).toContain("What are you sending?");
});

it("starts on the first choice and offers up to three screenshots", () => {
  const html = render(["social"]);
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  expect(radios.filter((radio) => radio.includes('checked=""'))).toHaveLength(1);
  expect(radios.find((radio) => radio.includes('checked=""'))).toContain('value="social_request"');
  expect(html).toContain("0/3");
  expect(html).toContain("or paste screenshots from clipboard");
});

it("starts with the post's line and the social intent selected when it is opened from a post", () => {
  const html = render(["website", "social"], { defaultIntent: "social_request", defaultBody: aboutLine("Year-end check-up", "2026-12-01") });
  const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
  expect(radios.find((radio) => radio.includes('checked=""'))).toContain('value="social_request"');
  expect(html).toContain('About the post &quot;Year-end check-up&quot; (Tue 1 Dec): </textarea>');
});

it("changes nothing when opened with no post", () => {
  const html = render(["website", "social"]);
  expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  expect(html.match(/<input type="radio"[^>]*>/g)?.find((radio) => radio.includes('checked=""'))).toContain('value="website_update"');
});

it("never uses a dash in what it says", () => {
  expect(render(["website", "social", "search"]).replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});

it("leaves an empty box to our own inline message, not the browser's bubble", () => {
  const html = render(["website"]);
  expect(html).toMatch(/<form[^>]*noValidate/);
  expect(html).not.toContain("Please fill in");
});
