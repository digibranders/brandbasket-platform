import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { SetupFormState } from "@/lib/service-setup";

vi.mock("@/app/app-host/(protected)/todo/actions", () => ({ saveSetupItemAction: vi.fn() }));

// Static rendering never runs a form action, so the form state is set directly.
let formState: SetupFormState = { status: "idle" };
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [formState, vi.fn(), false] };
});

import { SetupItemForm } from "@/components/todo/setup-item-form";
import { TodoList } from "@/components/todo/todo-list";
import { TodoRow } from "@/components/todo/todo-row";
import type { TodoItem } from "@/lib/todo";

const BRAND: TodoItem = { key: "brand", label: "Logo and photos", hint: "Your logo and photos", service: "website", done: false, kind: "link", href: "/onboarding/brand" };
const ACCOUNTS: TodoItem = { key: "accounts", label: "Instagram and Facebook pages", hint: "Links to your pages", service: "social", done: false, kind: "form", setup: "accounts" };
const AREAS: TodoItem = { key: "areas", label: "Areas you serve", hint: "Where you want to be found", service: "search", done: false, kind: "form", setup: "areas" };

function render(items: readonly TodoItem[], focus?: string): string {
  return renderToStaticMarkup(createElement(TodoList, { items, answers: { social: undefined, search: undefined }, focus })).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  formState = { status: "idle" };
});

it("lists open items before done ones", () => {
  const html = render([{ ...BRAND, done: true }, ACCOUNTS]);
  expect(html.indexOf("Instagram and Facebook pages")).toBeLessThan(html.indexOf("Logo and photos"));
});

it("gives a website item a link to its setup page, and Edit once it is done", () => {
  expect(render([BRAND])).toContain('href="/onboarding/brand"');
  expect(render([{ ...BRAND, done: true }])).toContain(">Edit<");
});

it("gives a form item its fields and a Save button", () => {
  const html = render([ACCOUNTS]);
  expect(html).toContain("Instagram page");
  expect(html).toContain("Facebook page");
  expect(html).toContain("<select");
  expect(html).toContain(">Save</button>");
});

it("opens the first open form item, and the one named by focus", () => {
  expect(render([ACCOUNTS, AREAS]).match(/<details[^>]* open/g)).toHaveLength(1);
  expect(render([ACCOUNTS, AREAS], "areas")).toMatch(/id="areas"[^>]*><details[^>]* open/);
  expect(render([ACCOUNTS, AREAS], "areas")).not.toMatch(/id="accounts"[^>]*><details[^>]* open/);
});

it("says All set when nothing is open, and still lists the done items", () => {
  const html = render([{ ...BRAND, done: true }]);
  expect(html).toContain("All set. Thank you.");
  expect(html).toContain("Logo and photos");
});

it("says there is nothing to do for a customer with no items", () => {
  expect(render([])).toContain("Nothing to do right now.");
});

it("shows an error next to its field and keeps what was typed", () => {
  formState = {
    status: "error",
    key: "accounts",
    field: "instagramUrl",
    message: "That does not look like an Instagram link.",
    values: { instagramUrl: "not a link", facebookUrl: "", adminAccess: "not_yet" },
  };
  const html = renderToStaticMarkup(createElement(SetupItemForm, { setup: "accounts", saved: undefined }));
  expect(html).toMatch(/role="alert"[^>]*>That does not look like an Instagram link\./);
  expect(html).toContain('value="not a link"');
  expect(html).toContain('aria-invalid="true"');
});

it("never asks for a password", () => {
  const html = render([BRAND, ACCOUNTS, AREAS]);
  expect(html).not.toMatch(/type="password"/);
  expect(html).not.toMatch(/name="[^"]*(password|passcode|pin)[^"]*"/i);
});

it("keeps a row's open state its own: only the initial value comes from the page", () => {
  expect(renderToStaticMarkup(createElement(TodoRow, { initiallyOpen: true, className: "group" }, "x"))).toMatch(/^<details[^>]* open/);
  expect(renderToStaticMarkup(createElement(TodoRow, { initiallyOpen: false, className: "group" }, "x"))).not.toContain(" open");
});

it("always renders the status region, empty until saved, so the saved message is announced", () => {
  const idle = renderToStaticMarkup(createElement(SetupItemForm, { setup: "offers", saved: undefined }));
  expect(idle).toMatch(/<p role="status"[^>]*><\/p>/);
  expect(idle).not.toContain("Saved.");
  formState = { status: "saved", key: "offers" };
  expect(renderToStaticMarkup(createElement(SetupItemForm, { setup: "offers", saved: undefined }))).toMatch(/role="status"[^>]*>Saved\.</);
});

it("gives the budget a numeric keypad and keeps browsers from autofilling the text inputs", () => {
  const budget = renderToStaticMarkup(createElement(SetupItemForm, { setup: "budget", saved: undefined }));
  expect(budget).toMatch(/name="adBudgetRupees"[^>]*inputMode="numeric"|inputMode="numeric"[^>]*name="adBudgetRupees"/);
  expect(budget.match(/autoComplete="off"/g)).toHaveLength(2);
  expect(budget.match(/inputMode=/g)).toHaveLength(1);
});
