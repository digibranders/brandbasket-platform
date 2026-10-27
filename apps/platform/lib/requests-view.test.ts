import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RequestsView } from "@/components/requests/requests-view";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { RequestRow } from "@/lib/requests/rows";

const row = (overrides: Partial<RequestRow>): RequestRow => ({
  ticketId: "t1",
  title: "Add an Implants page",
  word: "Quoted",
  tone: "waiting",
  sub: "Website · 27 Nov",
  unread: false,
  open: true,
  ...overrides,
});

const ROWS = [
  row({}),
  row({ ticketId: "t2", title: "Change the main photo", word: "In progress", tone: "progress", sub: "Website · 26 Nov", unread: true }),
  row({ ticketId: "t3", title: "New Sunday hours", word: "Done", tone: "done", sub: "Website · 23 Nov", open: false }),
];

function render(overrides: Partial<Parameters<typeof RequestsView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(RequestsView, {
      rows: ROWS,
      listed: ROWS.filter((entry) => entry.open),
      filter: "open",
      selectedId: "t1",
      explicit: false,
      includedLine: "This month: 1 of 2 included edits used.",
      detail: createElement("p", null, "THE OPEN REQUEST"),
      ...overrides,
    }),
  ).replaceAll("<!-- -->", "");
}

it("heads the page with the included edits used and a soft Ask for a change link", () => {
  const html = render();
  expect(html).toContain(">Requests</h1>");
  expect(html).toContain("Ask for any change and follow it here. This month: 1 of 2 included edits used.");
  expect(html).toContain('href="/requests/new"');
  expect(html).not.toContain(DARK_BUTTON);
});

it("leaves the included edits out when the plan has none", () => {
  expect(render({ includedLine: null })).not.toContain("included edits");
});

it("counts Open and Done, marks the one showing, and links each row to its request in the list it sits in", () => {
  const html = render();
  expect(html).toContain('aria-current="true"');
  expect(html).toMatch(/Open <span[^>]*>2<\/span>/);
  expect(html).toMatch(/Done <span[^>]*>1<\/span>/);
  expect(html).toContain('href="/requests?filter=open&amp;open=t1"');
  expect(html).toContain('href="/requests?filter=done"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

it("writes each row's title, status word and kind and date, and says when there is a reply to read", () => {
  const html = render();
  for (const text of ["Add an Implants page", "Quoted", "Website · 27 Nov", "In progress", "New reply"]) expect(html).toContain(text);
  expect(html).not.toContain("New Sunday hours");
});

it("shows the request in the right-hand pane, and on a phone only when the address asked for it", () => {
  expect(render()).toContain("THE OPEN REQUEST");
  expect(render({ explicit: false })).toMatch(/<div class="min-w-0 lg:block hidden">/);
  const asked = render({ explicit: true });
  expect(asked).toMatch(/<div class="min-w-0 lg:block block">/);
  expect(asked).toContain("All requests");
});

it("says there are no requests yet instead of drawing an empty list", () => {
  const html = render({ rows: [], listed: [], selectedId: null, detail: null });
  expect(html).toContain("No requests yet. Ask for a change and you can follow it here.");
  expect(html).not.toContain("Show requests");
});

it("says nothing is open or done in a list with nothing in it", () => {
  expect(render({ listed: [] })).toContain("Nothing is open.");
  expect(render({ listed: [], filter: "done" })).toContain("Nothing is done yet.");
});
