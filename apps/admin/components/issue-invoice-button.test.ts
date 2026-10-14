import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IssueInvoiceButton } from "./issue-invoice-button";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: status.pending, data: null, method: null, action: null }),
}));

const render = (): string => renderToStaticMarkup(createElement(IssueInvoiceButton, { label: "Issue invoice for the ₹3,539 payment of 9 October 2026" }));

beforeEach(() => {
  status.pending = false;
});

describe("IssueInvoiceButton", () => {
  it("is a submit button named for its payment when idle", () => {
    const html = render();
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-label="Issue invoice for the ₹3,539 payment of 9 October 2026"');
    expect(html).toContain(">Issue invoice<");
    expect(html).not.toMatch(/ disabled[ =>]/);
    expect(html).toContain('aria-busy="false"');
  });

  it("is disabled, busy and says it is issuing while the form is posting", () => {
    status.pending = true;
    const html = render();
    expect(html).toMatch(/ disabled[ =>]/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(">Issuing…<");
    // Its accessible name is its visible words, not the idle label.
    expect(html).not.toContain("aria-label");
  });
});
