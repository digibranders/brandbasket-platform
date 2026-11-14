import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSetupAsks } from "@/features/setup/loader";
import type { CustomerContext } from "@/lib/guards";
import { ToastProvider } from "@/ui";
import { SocialAds, SocialOverview } from "./components/social-screens";
import { loadAds, loadCampaigns, loadChannelsColumn, loadPosts, loadReach, loadReportLink, loadWaitingPostCount } from "./loader";
import type { PostView } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({
  loadPosts: vi.fn(),
  loadAds: vi.fn(),
  loadCampaigns: vi.fn(),
  loadReach: vi.fn(),
  loadChannelsColumn: vi.fn(),
  loadReportLink: vi.fn(),
  loadWaitingPostCount: vi.fn(),
}));
vi.mock("@/features/setup/loader", () => ({ loadSetupAsks: vi.fn(), loadNotBought: vi.fn() }));
vi.mock("./actions", () => ({ approvePostsAction: vi.fn() }));
vi.mock("./accounts/actions", () => ({ startConnectAction: vi.fn() }));

const NOW = new Date("2026-11-04T06:00:00.000Z");
const NOISE = /No data|undefined|\bnull\b|NaN/;
const down = new Error("connection refused");
const customer = { role: "owner", services: ["social"], billing: { status: "paid" }, businessId: "b1", tenant: {}, currency: "INR" } as unknown as CustomerContext;
const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>);
const POST: PostView = { id: "p1", title: "Diwali offer", caption: "Caption", dueOn: "2026-11-05", status: "planned", hasImage: false, format: "post", channel: "instagram" };

/** The calm read of everything: nothing planned, nothing measured, nothing connected. */
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSetupAsks).mockResolvedValue([]);
  vi.mocked(loadReportLink).mockResolvedValue(null);
  vi.mocked(loadWaitingPostCount).mockResolvedValue({ count: 0, byDueOn: null });
  vi.mocked(loadPosts).mockResolvedValue({ posts: [], month: "November" });
  vi.mocked(loadAds).mockResolvedValue({ ads: null, month: "November" });
  vi.mocked(loadCampaigns).mockResolvedValue({ campaigns: [], month: "November" });
  vi.mocked(loadReach).mockResolvedValue(null);
  vi.mocked(loadChannelsColumn).mockResolvedValue({ rows: [], missing: [], live: false });
});

describe("Social media Overview: one failed panel", () => {
  it.each([
    { panel: "posts", what: "your posts", set: () => vi.mocked(loadPosts).mockRejectedValue(down), heading: "Waiting for your approval" },
    { panel: "ads", what: "your ad figures", set: () => vi.mocked(loadAds).mockRejectedValue(down), heading: "Ads" },
    { panel: "reach", what: "your social reach", set: () => vi.mocked(loadReach).mockRejectedValue(down), heading: "Social reach" },
    { panel: "setup", what: "what we need from you", set: () => vi.mocked(loadSetupAsks).mockRejectedValue(down), heading: "What we need from you" },
  ])("$panel failed shows its own error and the page header", async ({ what, set, heading }) => {
    set();
    wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Content calendar", level: 1 })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("with the posts failed, the ads and reach panels still draw", async () => {
    vi.mocked(loadPosts).mockRejectedValue(down);
    vi.mocked(loadAds).mockResolvedValue({ ads: { spent: "₹9,000", spentCents: 900_000, budget: "₹13,000", budgetCents: 1_300_000, percent: 69, leads: 18, costPerLead: "₹500", adMoney: null, updatedAt: NOW }, month: "November" });
    wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText("Leads from ads")).toBeTruthy();
    expect(screen.getByText("We could not load your posts.")).toBeTruthy();
  });
});

describe("Social media Overview: everything ok but empty", () => {
  it("says why the approvals and the week are empty and draws no empty strips", async () => {
    const { container } = wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText("When a post is ready, it appears here as it will look, with one button to approve it.")).toBeTruthy();
    expect(screen.getByText("No posts are planned for this week.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Social media Posts", () => {
  it("a failed posts read shows its own error and the tabs", async () => {
    vi.mocked(loadPosts).mockRejectedValue(down);
    wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText("We could not load your posts.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Content calendar", level: 1 })).toBeTruthy();
  });

  it("no posts says what appears on the calendar", async () => {
    const { container } = wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText("No posts are planned for November yet.")).toBeTruthy();
    expect(screen.getByText("Planned and published posts appear on their day.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });

  it("a scheduled post with an empty waiting list still says nothing is waiting", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ posts: [POST], month: "November" });
    wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText("When a post is ready, it appears here as it will look, with one button to approve it.")).toBeTruthy();
  });
});

describe("Social Ads", () => {
  it.each([
    { panel: "ads", what: "your ad figures", heading: "Ads", set: () => vi.mocked(loadAds).mockRejectedValue(down), campaigns: [{ id: "c1", name: "Diwali", platform: "meta", spendCents: 100, budgetCents: 200, leads: 1, updatedAt: NOW }] },
    { panel: "campaigns", what: "your campaigns", heading: "Campaigns", set: () => vi.mocked(loadCampaigns).mockRejectedValue(down), campaigns: [] },
  ] as const)("$panel failed shows its own error", async ({ what, heading, set }) => {
    set();
    wrap(await SocialAds({ customer, now: NOW }));
    expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });

  it("no ad figures says when they appear", async () => {
    const { container } = wrap(await SocialAds({ customer, now: NOW }));
    expect(screen.getByText("No ad figures for this month yet.")).toBeTruthy();
    expect(screen.getByText("Your ad spend and results appear here as soon as we have them.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Social media channels column", () => {
  it("a failed read shows its own error and the rest of the page", async () => {
    vi.mocked(loadChannelsColumn).mockRejectedValue(down);
    wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.getByText("We could not load your channels.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Content calendar", level: 1 })).toBeTruthy();
  });

  it("no accounts shows no empty-state paragraph, only what can be connected", async () => {
    const { container } = wrap(await SocialOverview({ customer, now: NOW }));
    expect(screen.queryByText("No accounts are connected yet.")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
