import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoogleConnectionState } from "@/lib/server/google-admin";
import { GoogleAccountSection } from "./google-section";

vi.mock("server-only", () => ({}));

const STATES: readonly GoogleConnectionState[] = [
  { purpose: "read", connection: { accountEmail: "official.brandbasket@gmail.com", status: "connected", lastOkAt: new Date("2026-11-03T04:02:00.000Z"), lastError: null, updatedAt: new Date("2026-11-03T04:02:00.000Z") } },
  { purpose: "write", connection: { accountEmail: "official.brandbasket@gmail.com", status: "connected", lastOkAt: null, lastError: null, updatedAt: new Date("2026-11-03T04:02:00.000Z") } },
];
const render = (gsc: number, ga4 = 298): string => renderToStaticMarkup(createElement(GoogleAccountSection, { states: STATES, counts: { gsc, ga4 }, accountEmail: "official.brandbasket@gmail.com" }));

describe("Settings, Google account counts", () => {
  it("shows both counts against Google's limits and no warning below 800", () => {
    const html = render(312);
    expect(html).toContain("Search Console sites");
    expect(html).toContain("312 of 1,000");
    expect(html).toContain("Analytics properties");
    expect(html).toContain("298 of 2,000");
    expect(html).not.toContain("google_slot");
    expect(html).not.toContain('role="meter"');
  });

  it("shows the amber callout and a thin meter from 800 sites, and says nothing stops", () => {
    const html = render(812);
    expect(html).toContain("This account holds 812 Search Console sites, close to Google&#x27;s limit of 1,000.");
    expect(html).toContain("set google_slot to 2 for new sites. Nothing stops working at 812.");
    expect(html).toContain('role="meter"');
    expect(html).toContain("width:81.2%");
    expect(render(799)).not.toContain("google_slot");
    expect(render(800)).toContain("google_slot");
  });

  it("invents no last pull time: only the sign-in's own last use is shown", () => {
    expect(render(312)).not.toMatch(/Last pull/i);
  });

  it("shows no token or sealed value and uses no em or en dash", () => {
    for (const html of [render(312), render(812)]) {
      expect(html).not.toMatch(/sealed|refresh[_ -]?token|client[_ -]?secret/i);
      expect(html).not.toMatch(/[–—]/);
    }
  });
});
