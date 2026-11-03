import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSetupAsks } from "@/features/setup/loader";
import type { CustomerContext } from "@/lib/guards";
import { ToastProvider } from "@/ui";
import { SocialAccounts, SocialAds, SocialContent, SocialOverview } from "./components/social-screens";
import { loadAccounts, loadAds, loadCampaigns, loadPosts, loadReach, loadReportLink, loadWaitingPostCount } from "./loader";
import { accountRows, adsView, campaignRows, reachView, type CampaignSource, type PostView } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({
  loadPosts: vi.fn(),
  loadAds: vi.fn(),
  loadCampaigns: vi.fn(),
  loadReach: vi.fn(),
  loadAccounts: vi.fn(),
  loadReportLink: vi.fn(),
  loadWaitingPostCount: vi.fn(),
}));
vi.mock("@/features/setup/loader", () => ({ loadSetupAsks: vi.fn(), loadNotBought: vi.fn() }));
vi.mock("./actions", () => ({ approvePostsAction: vi.fn() }));

const NOW = new Date("2026-11-04T06:00:00.000Z");
const customer = (over: Partial<CustomerContext> = {}): CustomerContext =>
  ({ role: "owner", services: ["social"], billing: { status: "paid" }, businessId: "b1", tenant: {}, currency: "INR", ...over }) as unknown as CustomerContext;

function post(id: string, dueOn: string, status: PostView["status"], over: Partial<PostView> = {}): PostView {
  return { id, title: `Post ${id}`, caption: `Caption ${id}`, dueOn, status, hasImage: false, format: "post", channel: "instagram", ...over };
}
const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>);
const FIGURES = { adSpendCents: 900_000, adBudgetCents: 1_300_000, adEnquiries: 18, updatedAt: new Date("2026-11-03T05:00:00.000Z") };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSetupAsks).mockResolvedValue([]);
  vi.mocked(loadReportLink).mockResolvedValue(null);
  vi.mocked(loadWaitingPostCount).mockResolvedValue({ count: 0, byDueOn: null });
  vi.mocked(loadAds).mockResolvedValue({ ads: null, month: "November" });
  vi.mocked(loadCampaigns).mockResolvedValue({ campaigns: [], month: "November" });
  vi.mocked(loadReach).mockResolvedValue(null);
});

const ENTERED = new Date("2026-11-03T05:00:00.000Z");
function campaign(id: string, name: string, over: Partial<CampaignSource> = {}): CampaignSource {
  return { id, name, platform: "meta", spendCents: 412_000, budgetCents: 500_000, leads: 9, updatedAt: ENTERED, ...over };
}

describe("Social & Ads Overview", () => {
  it("shows an error state, never 'No posts are waiting', when the posts cannot be read", async () => {
    vi.mocked(loadPosts).mockRejectedValue(new Error("connection refused"));
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your posts.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("No posts are waiting for you.")).toBeNull();
    expect(screen.queryByText("Approve")).toBeNull();
  });

  it("puts the approvals first with Approve on each post and Approve all when several wait", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-25", "awaiting_approval"), post("b", "2026-11-26", "awaiting_approval"), post("c", "2026-11-03", "published")] });
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("2 posts need your OK by Wed 25 Nov")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve all 2" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(2);
    expect(screen.getAllByText("Instagram post · Wed 25 Nov").length).toBeGreaterThan(0);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings[0]).toBe("Waiting for your approval");
  });

  it("offers a single post only Approve, not Approve all", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-25", "awaiting_approval")] });
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Approve all/ })).toBeNull();
  });

  it("shows a viewer the posts but no way to approve or ask for a change", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-25", "awaiting_approval"), post("b", "2026-11-26", "awaiting_approval")] });
    wrap(await SocialOverview({ customer: customer({ role: "viewer" }), now: NOW }));
    expect(screen.getAllByRole("button", { name: "Review" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ask for a change" })).toBeNull();
  });

  it("does not offer approval on a lapsed plan", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-25", "awaiting_approval")] });
    wrap(await SocialOverview({ customer: customer({ billing: { status: "lapsed" } as never }), now: NOW }));
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });

  it("leaves out the figures that have no source instead of showing zeros", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [] });
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("No posts are waiting for you.")).toBeTruthy();
    for (const word of ["Ad spend", "Leads from ads", "Cost per lead", "Posts published", "Reach", "Clicks", "Campaigns"]) expect(screen.queryByText(word)).toBeNull();
  });

  it("shows ad spend, leads and cost per lead with the date they were updated when staff entered them", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-03", "published"), post("b", "2026-11-05", "planned")] });
    vi.mocked(loadAds).mockResolvedValue({ ads: adsView({ snapshot: FIGURES, adCreditCents: 0, currency: "INR" }), month: "November" });
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("Ad spend")).toBeTruthy();
    expect(screen.getByText("₹9,000")).toBeTruthy();
    expect(screen.getByText("Cost per lead")).toBeTruthy();
    expect(screen.getByText("₹500")).toBeTruthy();
    expect(screen.getByText("Posts published")).toBeTruthy();
    expect(screen.getAllByText(/Updated Tue 3 Nov/).length).toBeGreaterThan(0);
  });

  it("shows the reach figures staff entered, each with its month and the date it was entered", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [] });
    vi.mocked(loadReach).mockResolvedValue(reachView({ month: "2026-10-01", reach: 52_300, followers: 1_204, profileVisits: null, updatedAt: ENTERED }, NOW));
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("People reached")).toBeTruthy();
    expect(screen.getByText("52,300")).toBeTruthy();
    expect(screen.getByText("Followers")).toBeTruthy();
    expect(screen.getByText("1,204")).toBeTruthy();
    expect(screen.queryByText("Profile visits")).toBeNull();
    expect(screen.getAllByText("October. Updated Tue 3 Nov")).toHaveLength(2);
  });

  it("leaves reach out when none was entered, and shows its error on its own when it cannot be read", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [{ ...post("a", "2026-11-25", "awaiting_approval") }] });
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.queryByText("People reached")).toBeNull();
    expect(screen.queryByText("Social reach")).toBeNull();
    cleanup();
    vi.mocked(loadReach).mockRejectedValue(new Error("down"));
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your social reach.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
  });

  it("shows the ads error on its own and keeps the approvals", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-25", "awaiting_approval")] });
    vi.mocked(loadAds).mockRejectedValue(new Error("down"));
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your ad figures.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
  });

  it("shows the setup card, and its error when the saved answers cannot be read", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [] });
    vi.mocked(loadSetupAsks).mockResolvedValue([{ key: "accounts", label: "Instagram and Facebook pages", hint: "Links", href: "/checklist?item=accounts" }]);
    const { unmount } = wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("We need one thing from you")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add" }).getAttribute("href")).toBe("/checklist?item=accounts");
    unmount();
    vi.mocked(loadSetupAsks).mockRejectedValue(new Error("down"));
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load what we need from you.")).toBeTruthy();
  });

  it("shows a viewer no setup card, whose only buttons are Add", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [] });
    vi.mocked(loadSetupAsks).mockResolvedValue([{ key: "accounts", label: "Instagram and Facebook pages", hint: "Links", href: "/checklist?item=accounts" }]);
    wrap(await SocialOverview({ customer: customer({ role: "viewer" }), now: NOW }));
    expect(screen.queryByText("We need one thing from you")).toBeNull();
    expect(screen.queryByRole("link", { name: "Add" })).toBeNull();
  });

  it("says the ad leads are reported by us, as they are not the enquiries in the list", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [] });
    vi.mocked(loadAds).mockResolvedValue({ ads: adsView({ snapshot: FIGURES, adCreditCents: 0, currency: "INR" }), month: "November" });
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByText(/From your ads this month \(reported by us\)/)).toBeTruthy();
  });

  it("links the monthly report only when staff added an https one", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [] });
    vi.mocked(loadReportLink).mockResolvedValue("https://example.com/report");
    wrap(await SocialOverview({ customer: customer(), now: NOW }));
    expect(screen.getByRole("link", { name: "Monthly report" }).getAttribute("href")).toBe("https://example.com/report");
  });
});

describe("Content", () => {
  it("shows the waiting posts as cards with their captions, and a calendar of the month", async () => {
    vi.mocked(loadPosts).mockResolvedValue({ month: "November", posts: [post("a", "2026-11-25", "awaiting_approval"), post("b", "2026-11-03", "published")] });
    wrap(await SocialContent({ customer: customer(), now: NOW }));
    expect(screen.getByText("Caption a")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Posts in November" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Content/ }).textContent).toContain("1");
  });

  it("shows an error, not an empty calendar, when the posts cannot be read", async () => {
    vi.mocked(loadPosts).mockRejectedValue(new Error("down"));
    wrap(await SocialContent({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your posts.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Calendar" })).toBeNull();
  });
});

describe("Ads", () => {
  it("draws no panel when there are no ad figures, and says what will appear", async () => {
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.getByText("No ad figures for this month yet.")).toBeTruthy();
    expect(screen.queryByText("Campaigns")).toBeNull();
    expect(screen.queryByText("Cost per lead")).toBeNull();
  });

  it("shows spend against budget, leads, cost per lead and the ad money", async () => {
    vi.mocked(loadAds).mockResolvedValue({ ads: adsView({ snapshot: FIGURES, adCreditCents: 300_000, currency: "INR" }), month: "November" });
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.getByText("₹9,000 of ₹13,000")).toBeTruthy();
    expect(screen.getByText("Leads from ads")).toBeTruthy();
    expect(screen.getByText("₹500")).toBeTruthy();
    expect(screen.getByText("₹3,000")).toBeTruthy();
    expect(screen.getByText(/Figures updated Tue 3 Nov/)).toBeTruthy();
  });

  it("shows an error when the figures cannot be read", async () => {
    vi.mocked(loadAds).mockRejectedValue(new Error("down"));
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your ad figures.")).toBeTruthy();
    expect(screen.queryByText("No ad figures for this month yet.")).toBeNull();
  });

  it("lists the campaigns with spend, budget, leads and cost per lead, and when they were updated", async () => {
    vi.mocked(loadCampaigns).mockResolvedValue({
      campaigns: campaignRows([campaign("b", "Winter checkup", { spendCents: 120_000, budgetCents: null, leads: 0 }), campaign("a", "Full body checkup, Dadar")], "INR"),
      month: "November",
    });
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.getByRole("heading", { name: "Campaigns" })).toBeTruthy();
    expect(screen.getByText("November. Updated Tue 3 Nov")).toBeTruthy();
    const rows = screen.getAllByRole("row").map((row) => row.textContent);
    expect(rows[1]).toBe("Full body checkup, DadarMeta₹4,120₹5,0009₹457.78");
    expect(rows[2]).toBe("Winter checkupMeta₹1,200Not available0No leads");
  });

  it("says a figure is not available instead of showing a zero, and gives no cost per lead without leads", async () => {
    vi.mocked(loadCampaigns).mockResolvedValue({ campaigns: campaignRows([campaign("a", "Home collection", { leads: null, budgetCents: null })], "INR"), month: "November" });
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.getAllByText("Not available")).toHaveLength(3);
    expect(screen.queryByText("₹0")).toBeNull();
  });

  it("draws no campaigns panel when none were entered, and shows an error when they cannot be read", async () => {
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.queryByRole("heading", { name: "Campaigns" })).toBeNull();
    cleanup();
    vi.mocked(loadCampaigns).mockRejectedValue(new Error("down"));
    wrap(await SocialAds({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your campaigns.")).toBeTruthy();
  });
});

describe("Accounts", () => {
  it("lists the accounts with their state, and Connect only on one that is not connected", async () => {
    vi.mocked(loadAccounts).mockResolvedValue(
      accountRows([
        { platform: "instagram", handle: "@apex", url: "https://instagram.com/apex", status: "connected", checkedAt: new Date("2026-11-02T05:00:00.000Z") },
        { platform: "whatsapp_business", handle: null, url: null, status: "not_connected", checkedAt: null },
      ]),
    );
    wrap(await SocialAccounts({ customer: customer(), now: NOW }));
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Connect" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "@apex" }).getAttribute("href")).toBe("https://instagram.com/apex");
  });

  it("explains an empty list and shows an error when it cannot be read", async () => {
    vi.mocked(loadAccounts).mockResolvedValue([]);
    const { unmount } = wrap(await SocialAccounts({ customer: customer(), now: NOW }));
    expect(screen.getByText("No accounts are listed yet.")).toBeTruthy();
    unmount();
    vi.mocked(loadAccounts).mockRejectedValue(new Error("down"));
    wrap(await SocialAccounts({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your accounts.")).toBeTruthy();
  });
});
