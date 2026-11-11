import type { ReportSourceRow } from "@brandbasket/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoogleCard, type GoogleCardProps } from "./google-card";

vi.mock("server-only", () => ({}));
vi.mock("./google-actions", () => ({ retryGoogleVerificationAction: vi.fn(), detachGoogleAction: vi.fn(), provisionGoogleAction: vi.fn() }));
vi.mock("./parts", () => ({ AnalyticsBlock: () => "[property form]" }));

const NOW = new Date("2026-11-03T04:00:00.000Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 86_400_000);
const row = (over: Partial<ReportSourceRow> = {}): ReportSourceRow => ({
  id: "r1",
  businessId: "b1",
  source: "gsc",
  externalId: "https://omsweets.in/",
  status: "awaiting_setup",
  lastOkAt: null,
  lastError: null,
  googleSlot: 1,
  measurementId: null,
  verifiedAt: null,
  provisionedAt: null,
  secondOwnerOk: false,
  detail: null,
  createdAt: daysAgo(1),
  updatedAt: NOW,
  ...over,
});
const GSC_OK = row({ status: "connected", verifiedAt: daysAgo(20), secondOwnerOk: true });
const GA4_OK = row({ source: "ga4", externalId: "412345678", status: "connected", measurementId: "G-AB12CD34EF" });
const GA4_WAITING = row({ source: "ga4", externalId: "412345678", status: "awaiting_setup", measurementId: "G-AB12CD34EF" });

const base: GoogleCardProps = {
  businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c",
  gsc: GSC_OK,
  ga4: GA4_OK,
  gscLatestDay: "2026-10-30",
  ga4LatestDay: "2026-11-02",
  hostname: "omsweets.in",
  freeAddress: false,
  tagEnabled: false,
  canManage: true,
  notice: null,
  serviceAccountEmail: null,
  now: NOW,
};
const render = (over: Partial<GoogleCardProps> = {}): string => renderToStaticMarkup(createElement(GoogleCard, { ...base, ...over }));

describe("GoogleCard states", () => {
  it("connected: both halves, the data days and the three links, and no detail callout", () => {
    const html = render();
    for (const text of ["Both connected", "Search Console", "Analytics", "https://omsweets.in/", "G-AB12CD34EF", "412345678", "Added", "Switched off", "Last data day", "30 Oct", "2 Nov"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Open in Search Console");
    expect(html).toContain("Open in Analytics");
    expect(html).toContain("Detach");
    expect(html).not.toContain("Retry verification");
    expect(html).not.toContain("Provision now");
    expect(html).not.toContain("Waiting for Google");
  });

  it("setting up: says only what the rows say and offers a retry", () => {
    const html = render({ gsc: row({ detail: "Waiting for the site to show the verification tag" }), ga4: GA4_WAITING });
    expect(html).toContain("Setting up");
    expect(html).toContain("Waiting for Google to see the verification tag on omsweets.in");
    expect(html).toContain("Waiting for the tag");
    expect(html).toContain("After verifying");
    expect(html).toContain("Retry verification");
    expect(html).not.toContain("Provision now");
    expect(html).not.toContain("Open the live site");
  });

  it("needs a look: names the days since the site was added, the job's last note and the live site link", () => {
    const html = render({ gsc: row({ createdAt: daysAgo(4), detail: "Google has not seen the tag yet" }), ga4: GA4_WAITING });
    expect(html).toContain("Needs a look");
    expect(html).toContain("4 days after the site was added");
    expect(html).toContain("Google has not seen the tag yet");
    expect(html).toContain("Not verified");
    expect(html).toContain("Open the live site");
    expect(html).toContain("Retry verification");
  });

  it("a lost sign-in shows as a problem pill with its detail", () => {
    const html = render({ gsc: GSC_OK, ga4: row({ source: "ga4", status: "access_lost", externalId: "412345678", detail: "Access was revoked" }) });
    expect(html).toContain("Needs a look");
    expect(html).toContain("Access lost");
    expect(html).toContain("Access was revoked");
    expect(html).toContain("bg-error/10");
  });

  it("free address: the callout and the host, with no halves and no buttons", () => {
    const html = render({ gsc: null, ga4: null, hostname: "omsweets.sites.brandbasket.in", freeAddress: true });
    expect(html).toContain("Not added: free addresses are never indexed.");
    expect(html).toContain("omsweets.sites.brandbasket.in");
    for (const text of ["Retry verification", "Detach", "Open in", "Provision now", "Verified"]) expect(html).not.toContain(text);
  });

  it("detached: Provision now is the only action, and there is no Detach", () => {
    const html = render({ gsc: row({ status: "removed" }), ga4: row({ source: "ga4", status: "removed", externalId: "412345678" }) });
    expect(html).toContain("Detached");
    expect(html).toContain("Provision now");
    expect(html).not.toContain("Retry verification");
    expect(html).not.toContain(">Detach<");
  });

  it("says the Analytics tag is On, never Seen, when the switch is on", () => {
    const html = render({ tagEnabled: true });
    expect(html).toContain(">On<");
    expect(html).toContain("Not checked on the live page");
    expect(html).not.toMatch(/Seen/);
  });

  it("support staff see the card read only: links, but no action and no property form", () => {
    const html = render({ canManage: false, gsc: row({ createdAt: daysAgo(4) }), ga4: GA4_WAITING });
    expect(html).toContain("Open in Search Console");
    for (const text of ["Retry verification", "Detach", "Provision now", "[property form]", "Use a property the customer already has"]) expect(html).not.toContain(text);
    expect(render({ canManage: true })).toContain("[property form]");
  });

  it("keeps the property form folded away", () => {
    const html = render();
    expect(html).toContain("Use a property the customer already has");
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it("asks for the first-person confirmation before detaching", () => {
    const html = render();
    expect(html).toContain('name="confirm"');
    expect(html).toContain("I want to detach this client from Google.");
    expect(html).toMatch(/type="checkbox"[^>]*required|required[^>]*type="checkbox"/);
  });

  it("prints a fixed notice only for a known key", () => {
    expect(render({ notice: "retry-asked" })).toContain("Asked. The go-live job checks again within 15 minutes.");
    expect(render({ notice: null })).not.toContain("Asked.");
  });
});

describe("GoogleCard output", () => {
  const SECRETS = ["GOCSPX-client-secret-value", "1//refresh-token-value", "sealed:v1:abcdef", "meta-verification-token-value"];
  const states: readonly Partial<GoogleCardProps>[] = [
    {},
    { gsc: row(), ga4: GA4_WAITING },
    { gsc: row({ createdAt: daysAgo(5), detail: "Google has not seen the tag yet" }), ga4: GA4_WAITING },
    { gsc: GSC_OK, ga4: row({ source: "ga4", status: "access_lost", externalId: "412345678", detail: "Access was revoked" }) },
    { gsc: null, ga4: null, freeAddress: true, hostname: "omsweets.sites.brandbasket.in" },
    { gsc: null, ga4: null },
    { gsc: row({ status: "removed" }), ga4: row({ source: "ga4", status: "removed", externalId: "412345678" }) },
    { tagEnabled: true, notice: "detached" },
    { canManage: false },
  ];

  it("never prints a token, client secret or sealed value from the environment, and uses no em or en dash", () => {
    const keys = ["GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_SEALED", "NEXT_PUBLIC_GSC_VERIFICATION"] as const;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = SECRETS[0];
    process.env.GOOGLE_REFRESH_TOKEN = SECRETS[1];
    process.env.GOOGLE_SEALED = SECRETS[2];
    process.env.NEXT_PUBLIC_GSC_VERIFICATION = SECRETS[3];
    try {
      for (const state of states) {
        const html = render(state);
        for (const secret of SECRETS) expect(html).not.toContain(secret);
        expect(html).not.toMatch(/[–—]/);
        expect(html).not.toMatch(/refresh[_ -]?token|client[_ -]?secret|sealed/i);
      }
    } finally {
      for (const key of keys) delete process.env[key];
    }
  });
});
