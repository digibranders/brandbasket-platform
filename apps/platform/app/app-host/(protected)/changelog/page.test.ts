import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import ChangelogPage from "./page";

const html = renderToStaticMarkup(ChangelogPage()).replaceAll("<!-- -->", "");

it("is titled What’s new, as the account menu says", () => {
  expect(html).toContain(">What’s new</h1>");
  expect(html).not.toContain("Changelog");
});

it("lists every entry with its date, and marks only the newest", () => {
  for (const entry of CHANGELOG_ENTRIES) {
    expect(html).toContain(`dateTime="${entry.date}"`);
    expect(html).toContain(entry.title);
  }
  expect(html.match(/>Latest</g)).toHaveLength(1);
});

it("is rows on the page: no cards, no timeline marks, no picture", () => {
  expect(html).not.toContain("rounded-card");
  expect(html).not.toContain("border-l-2");
  expect(html).not.toContain("<svg");
});
