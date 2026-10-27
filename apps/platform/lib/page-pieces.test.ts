import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NoticeBanner } from "@/components/panel/notice-banner";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import { ActionRow, EmptyState, FactRows, PageColumns, PageFrame, PageHeader, PageSection } from "@/components/v2/page";

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

it("draws a tab bar under the title when the page has one, and nothing when it has none", () => {
  const html = render(createElement(PageHeader, { title: "Your website", tabs: createElement("nav", { "aria-label": "Your website" }, "Progress") }));
  expect(html.indexOf(">Your website</h1>")).toBeLessThan(html.indexOf('<nav aria-label="Your website">'));
  expect(render(createElement(PageHeader, { title: "Settings" }))).not.toContain("<nav");
});

it("frames a page: header first, then the blocks, filling the content area from the left up to 1560px", () => {
  const html = render(createElement(PageFrame, { title: "Requests", lede: "Ask for any change." }, createElement("p", null, "Body")));
  expect(html.indexOf("<header")).toBeLessThan(html.indexOf("Body"));
  expect(html).toContain("@container");
  expect(html).toContain("max-w-[97.5rem]");
  expect(html).toContain("mr-auto");
  expect(html).not.toContain("mx-auto");
  expect(html).toContain("gap-6 md:gap-8");
});

it("keeps a form page to a narrow column that still sits on the left", () => {
  const html = render(createElement(PageFrame, { title: "Ask for a change", width: "form" }, createElement("p", null, "Body")));
  expect(html).toContain("max-w-[40rem]");
  expect(html).not.toContain("max-w-[97.5rem]");
  expect(html).not.toContain("mx-auto");
});

it("puts the aside after the main column, as its own landmark, below it until the frame is wide", () => {
  const html = render(createElement(PageColumns, { main: createElement("p", null, "Main"), aside: createElement("p", null, "Aside") }));
  expect(html.indexOf("Main")).toBeLessThan(html.indexOf("<aside"));
  expect(html).toContain("@4xl:grid-cols-[minmax(0,1fr)_22.5rem]");
  expect(html).toContain("@5xl:grid-cols-[minmax(0,1fr)_25rem]");
  expect(html).toContain("xl:sticky");
});

it("says a page is empty with a marked icon, a title, a sentence and the one action", () => {
  const html = render(createElement(EmptyState, { icon: ChatCircleDots, title: "No requests yet", text: "Ask for a change and follow it here.", action: createElement("a", { href: "/requests/new" }, "Ask for a change") }));
  expect(html).toContain('<svg');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain(">No requests yet</h2>");
  expect(html).toContain("Ask for a change and follow it here.");
  expect(html).toContain('<a href="/requests/new">Ask for a change</a>');
  expect(html).toContain("shadow-lift");
});

it("leaves out the sentence and the action when there is nothing more to say or do", () => {
  const html = render(createElement(EmptyState, { icon: ChatCircleDots, title: "Nothing is open.", compact: true }));
  expect(html).toContain(">Nothing is open.</p>");
  expect(html).not.toContain("shadow-lift");
  expect(html.match(/<p[ >]/g)).toHaveLength(1);
});

it("lets a section whose rows pad themselves skip the space under its title", () => {
  expect(section({ id: "r", title: "Results", flush: true }, "Body")).not.toContain("pt-4");
  expect(section({ id: "r", title: "Results" }, "Body")).toContain("pt-4");
});
