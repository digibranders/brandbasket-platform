import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NoticeBanner } from "@/components/panel/notice-banner";
import { ActionRow, FactRows, PageHeader, PageSection } from "@/components/v2/page";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(element);
/** PageSection needs children, which createElement cannot take as a prop under the lint rule, so it is called as a function. */
const section = (props: Omit<Parameters<typeof PageSection>[0], "children">, body: string): string => render(PageSection({ ...props, children: body }));

it("opens a page with its title, one line under it and the one action", () => {
  const html = render(createElement(PageHeader, { title: "Billing", lede: "Your plan and each month's bill.", action: createElement("a", { href: "/x" }, "Go") }));
  expect(html).toContain("<h1");
  expect(html).toContain(">Billing</h1>");
  expect(html).toContain("Your plan and each month&#x27;s bill.");
  expect(html).toContain('<a href="/x">Go</a>');
});

it("leaves out the line and the action when there are none", () => {
  const html = render(createElement(PageHeader, { title: "Settings" }));
  expect(html).not.toContain("<p");
  expect(html).not.toContain("gap-2");
});

it("names a section by its title, with a hairline and no box", () => {
  const html = section({ id: "plan", title: "Your plan" }, "Body");
  expect(html).toContain('<section aria-labelledby="plan-title"');
  expect(html).toContain('<h2 id="plan-title"');
  expect(html).toContain("border-b border-line");
  expect(html).not.toContain("shadow");
  expect(html).not.toContain("rounded");
});

it("shows what sits at the far end of a section title", () => {
  const html = section({ id: "m", title: "Monthly billing", aside: "3 receipts" }, "Body");
  expect(html).toContain("3 receipts");
});

it("lists facts as labelled rows", () => {
  const html = render(createElement(FactRows, { items: [{ label: "Name", value: "Priya" }, { label: "Email", value: "p@example.test" }] }));
  expect(html).toContain("<dt");
  expect(html).toContain(">Name</dt>");
  expect(html).toContain(">Priya</dd>");
  expect(html).toContain("divide-y divide-line");
});

it("says a notice's good news in green and a problem in the warm wash, each in words", () => {
  const good = render(createElement(NoticeBanner, { ok: true, text: "Payment received." }));
  const bad = render(createElement(NoticeBanner, { ok: false, text: "That payment didn't go through." }));
  expect(good).toContain("bg-sage-wash");
  expect(good).toContain('role="status"');
  expect(bad).toContain("bg-rattan-wash");
  expect(bad).toContain("That payment didn&#x27;t go through.");
});

it("puts an action beside one plain line, with or without a title", () => {
  const plain = render(createElement(ActionRow, { text: "Close your account and end your plan.", action: createElement("a", { href: "/settings/delete" }, "Delete account") }));
  expect(plain).toContain("Close your account and end your plan.");
  expect(plain).toContain('<a href="/settings/delete">Delete account</a>');
  expect(plain).not.toContain("font-semibold");
  const titled = render(createElement(ActionRow, { title: "Receipts", text: "All of them.", action: "x" }));
  expect(titled).toContain(">Receipts</p>");
});
