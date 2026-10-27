import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountPanel } from "../../lib/account-panel";
import { AccountBar } from "./account-bar";
import { SupportContext } from "./support-context";

const PANEL: AccountPanel = {
  notices: [{ id: "request-reply-1", text: "New reply: Add an Implants page", href: "/support/1", actionable: true }],
  liveWebsiteUrl: null,
  siteStatus: { kind: "not_launched" },
};

function renderBar(unread: number): string {
  const bar = createElement(AccountBar, {
    account: { name: "Asha Rao", email: "asha@example.com" },
    panel: PANEL,
    signOut: async () => {},
    dark: false,
    docsUrl: "https://example.com/docs",
    contactEmail: "help@example.com",
  });
  return renderToStaticMarkup(createElement(SupportContext.Provider, { value: { open: () => {}, unread } }, bar));
}

describe("AccountBar bell", () => {
  it("counts a request reply once, even when the support launcher also reports unread replies", () => {
    expect(renderBar(1)).toContain("Notices, 1 needs you");
  });

  it("counts the same without any unread replies", () => {
    expect(renderBar(0)).toContain("Notices, 1 needs you");
  });
});
