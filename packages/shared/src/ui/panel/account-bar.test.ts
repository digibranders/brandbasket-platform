import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountPanel } from "../../lib/account-panel";
import { AccountBar } from "./account-bar";

const PANEL: AccountPanel = {
  notices: [{ id: "request-reply-1", text: "New reply: Add an Implants page", href: "/support/1", actionable: true }],
  liveWebsiteUrl: null,
  siteStatus: { kind: "not_launched" },
};

function renderBar(): string {
  const bar = createElement(AccountBar, {
    account: { name: "Asha Rao", email: "asha@example.com" },
    panel: PANEL,
    signOut: async () => {},
    dark: false,
    docsUrl: "https://example.com/docs",
    helpHref: "/requests/new?kind=other",
  });
  return renderToStaticMarkup(bar);
}

describe("AccountBar bell", () => {
  it("counts a request reply once", () => {
    expect(renderBar()).toContain("Notices, 1 needs you");
  });
});
