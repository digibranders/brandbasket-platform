import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SocialAnalytics } from "@/lib/server/social-analytics";
import { readAnalytics, windowsOf } from "@/lib/social/analytics";
import { AnalyticsView } from "./analytics-view";

vi.mock("server-only", () => ({}));
vi.mock("@/app/app-host/(protected)/social/actions", () => ({ connectChannelAction: vi.fn() }));
vi.mock("./brand-switcher", () => ({ BrandSwitcher: () => null }));

const windows = windowsOf(7, "2026-11-11");
const base = { brand: { externalId: "b1", view: null }, range: 7, days: { current: windows.current, previous: windows.previous }, unavailable: false } as unknown as Omit<SocialAnalytics, "analytics">;
const render = (analytics: SocialAnalytics["analytics"], connected: Parameters<typeof AnalyticsView>[0]["connected"], tab: Parameters<typeof AnalyticsView>[0]["tab"] = "overview", unavailable = false): string =>
  renderToStaticMarkup(<AnalyticsView social={{ ...base, analytics, unavailable } as SocialAnalytics} connected={connected} report={null} accounts={[{ id: "instagram:1", platform: "instagram", account: "omsweets" }, { id: "linkedin:1", platform: "linkedin", account: "Om Sweets" }]} channel="all" tab={tab} />);

describe("the Analytics page", () => {
  it("says the numbers are not available when the posting service could not be asked", () => {
    expect(render(null, ["instagram"], "overview", true)).toContain("not available just now");
  });

  it("tells a connected channel with no check yet that numbers come after the first daily check", () => {
    const html = render(readAnalytics({ channels: [{ channel: "instagram:1", platform: "instagram", status: "waiting" }], posts: [], accounts: [], hashtags: [] }), ["instagram"]);
    expect(html).toContain("after the first daily check");
  });

  it("offers a reconnect button for a channel that needs permission again", () => {
    const html = render(readAnalytics({ channels: [{ channel: "facebook:1", platform: "facebook", status: "reconnect" }], posts: [], accounts: [], hashtags: [] }), ["facebook"]);
    expect(html).toContain("Reconnect Facebook");
  });

  it("shows the not enough followers state on the audience tab", () => {
    const html = render(readAnalytics({ channels: [{ channel: "instagram:1", platform: "instagram", status: "ok" }], posts: [], accounts: [], hashtags: [], audience: { instagram: { status: "too_few_followers", followers: 42 } } }), ["instagram"], "audience");
    expect(html).toContain("Not enough followers yet");
    expect(html).toContain("42");
  });

  it("marks LinkedIn as not offered and shows the coverage table on the reports tab", () => {
    expect(render(null, [], "overview")).toContain("Not offered");
    expect(render(null, [], "reports")).toContain("What each network can tell us");
  });
});
