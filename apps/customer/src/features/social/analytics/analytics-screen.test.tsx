import { cleanup, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { SocialAnalytics } from "./components/analytics-screen";
import { loadChannelsColumn } from "../loader";
import { loadAnalytics } from "./loader";
import { readAnalytics, windowsOf } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/social/analytics", useSearchParams: () => new URLSearchParams(), unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadAnalytics: vi.fn() }));
vi.mock("../loader", () => ({ loadChannelsColumn: vi.fn() }));
vi.mock("../accounts/actions", () => ({ startConnectAction: vi.fn() }));

const NOW = new Date("2026-11-11T06:00:00.000Z");
const TODAY = "2026-11-11";
const w = windowsOf(30, TODAY);
const customer = { role: "owner", services: ["social"], billing: { status: "paid" }, businessId: "b1", tenant: {}, currency: "INR" } as unknown as CustomerContext;
const wrap = (node: ReactNode) => render(<NuqsTestingAdapter>{node}</NuqsTestingAdapter>);
const data = (body: unknown) => ({ range: 30 as const, today: TODAY, analytics: body === null ? null : readAnalytics(body) });
const ig = { channel: "instagram:1", platform: "instagram", status: "ok" };

beforeEach(() => {
  vi.resetAllMocks();
  cleanup();
  vi.mocked(loadChannelsColumn).mockResolvedValue({ rows: [{ id: "instagram:1", platform: "instagram", account: "acme", ending: null, paused: false }], missing: ["linkedin"], live: true });
});

describe("Social Analytics", () => {
  it("says the numbers start tomorrow when the posting service has none yet", async () => {
    vi.mocked(loadAnalytics).mockResolvedValue(data(null));
    wrap(await SocialAnalytics({ customer, range: 30, channel: "all", now: NOW }));
    expect(screen.getByText("Your numbers start tomorrow morning.")).toBeTruthy();
  });

  it("shows an error state, never zeros, when the numbers cannot be read", async () => {
    vi.mocked(loadAnalytics).mockRejectedValue(new Error("connection refused"));
    wrap(await SocialAnalytics({ customer, range: 30, channel: "all", now: NOW }));
    expect(screen.getByText("We could not load your numbers.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows reach with its change, a chart, and the posts with 'Not given' for numbers a network does not give", async () => {
    vi.mocked(loadAnalytics).mockResolvedValue(
      data({
        channels: [ig],
        posts: [{ postId: "a", channel: "instagram:1", platform: "instagram", permalink: "https://instagram.com/p/x", postedAt: `${w.current[2]}T10:00:00.000Z`, caption: "Diwali boxes", total: { reach: 2410, likes: 382 } }],
        accounts: [{ channel: "instagram:1", platform: "instagram", series: [...w.previous, ...w.current].map((date) => ({ date, reach: date >= w.current[0]! ? 200 : 100 })) }],
      }),
    );
    wrap(await SocialAnalytics({ customer, range: 30, channel: "all", now: NOW }));
    expect(screen.getAllByText("Reach").length).toBeGreaterThan(0);
    expect(screen.getByText("6,000")).toBeTruthy();
    expect(screen.getByText("+100%")).toBeTruthy();
    expect(screen.getByText("Diwali boxes")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View post" }).getAttribute("href")).toBe("https://instagram.com/p/x");
    expect(screen.getAllByText("Not given").length).toBeGreaterThan(0);
  });

  it("offers to reconnect a network that needs a new permission and does not invent its numbers", async () => {
    vi.mocked(loadAnalytics).mockResolvedValue(data({ channels: [ig, { channel: "facebook:7", platform: "facebook", status: "reconnect" }] }));
    wrap(await SocialAnalytics({ customer, range: 30, channel: "all", now: NOW }));
    expect(screen.getByText(/Reconnect your Facebook account to see numbers/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect Facebook" })).toBeTruthy();
  });

  it("explains an Instagram account with too few followers", async () => {
    vi.mocked(loadAnalytics).mockResolvedValue(data({ channels: [ig], audience: { instagram: { status: "too_few_followers", followers: 64 } }, accounts: [{ channel: "instagram:1", platform: "instagram", series: [{ date: w.current[5], reach: 5 }] }] }));
    wrap(await SocialAnalytics({ customer, range: 30, channel: "instagram", now: NOW }));
    expect(screen.getByText("Not enough followers yet.")).toBeTruthy();
    expect(screen.getByText("64 of 100")).toBeTruthy();
  });
});
