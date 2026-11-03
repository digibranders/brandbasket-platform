import { describe, expect, it } from "vitest";
import {
  accountRows,
  adsView,
  approvalCards,
  approvalOutcome,
  approveAllIds,
  approveAllLabel,
  approveIdsSchema,
  campaignRows,
  campaignsUpdatedAt,
  canApprove,
  changePostHref,
  dueLabel,
  MAX_APPROVE,
  monthCalendar,
  monthCounts,
  monthKey,
  monthLine,
  monthLabel,
  monthName,
  needsOkBy,
  postKindLabel,
  postStatusKey,
  postViews,
  postWindow,
  reachView,
  socialTabs,
  splitPosts,
  waitingHeadline,
  weekBounds,
  type PostRow,
  type PostView,
} from "./rules";

function post(id: string, dueOn: string, status: PostView["status"] = "planned"): PostView {
  return { id, title: `Post ${id}`, caption: null, dueOn, status, hasImage: false, format: null, channel: null };
}
const NOW = new Date("2026-11-04T06:00:00.000Z");

describe("dates", () => {
  it("reads the India month and week, not the UTC one", () => {
    expect(monthKey(NOW)).toBe("2026-11-01");
    expect(monthName(NOW)).toBe("November");
    expect(weekBounds(NOW)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    // 00:30 on Monday 2 Nov in India is still Sunday in UTC.
    expect(weekBounds(new Date("2026-11-01T19:00:00.000Z"))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    // 00:30 on 1 Dec in India is still 30 Nov in UTC.
    expect(monthKey(new Date("2026-11-30T19:00:00.000Z"))).toBe("2026-12-01");
  });

  it("loads the month, stretched to the end of a week that runs into the next month", () => {
    expect(postWindow(NOW)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(postWindow(new Date("2026-11-30T06:00:00.000Z"))).toEqual({ from: "2026-11-01", to: "2026-12-06" });
  });

  it("labels a due day as a short day", () => {
    expect(dueLabel("2026-12-01", NOW)).toBe("Tue 1 Dec");
  });
});

describe("postViews", () => {
  const row = (over: Partial<PostRow>): PostRow => ({ id: "a", kind: "post", title: "T", caption: null, dueOn: "2026-11-05", status: "planned", imageKey: null, format: "reel", channel: "instagram", ...over });

  it("keeps posts with a day and drops pages, listings and a post with no day", () => {
    const views = postViews([row({}), row({ id: "b", kind: "page" }), row({ id: "c", dueOn: null }), row({ id: "d", imageKey: "deliverables/d/display" })]);
    expect(views.map((view) => view.id)).toEqual(["a", "d"]);
    expect(views[1]?.hasImage).toBe(true);
    expect(views[0]).toMatchObject({ format: "reel", channel: "instagram" });
  });
});

describe("waiting posts", () => {
  const waiting = (...days: string[]): PostView[] => days.map((day, index) => post(`w${index}`, day, "awaiting_approval"));

  it("picks the earliest due date and writes the headline for none, one and many", () => {
    expect(needsOkBy(waiting("2026-12-04", "2026-12-01", "2026-12-03"), NOW)).toBe("Tue 1 Dec");
    expect(needsOkBy([], NOW)).toBeNull();
    expect(waitingHeadline([], NOW)).toBe("No posts are waiting for you.");
    expect(waitingHeadline(waiting("2026-12-01"), NOW)).toBe("1 post needs your OK by Tue 1 Dec");
    expect(waitingHeadline(waiting("2026-12-04", "2026-12-01"), NOW)).toBe("2 posts need your OK by Tue 1 Dec");
  });

  it("splits waiting posts (whatever their day) from this week's (whatever their status), each by day", () => {
    const posts = [post("c", "2026-11-06", "published"), post("a", "2026-11-03", "awaiting_approval"), post("late", "2026-11-12", "awaiting_approval"), post("b", "2026-11-05"), post("old", "2026-10-30", "published")];
    const { waiting: w, thisWeek } = splitPosts(posts, NOW);
    expect(w.map((entry) => entry.id)).toEqual(["a", "late"]);
    expect(thisWeek.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("counts this month's posts that are out", () => {
    const posts = [post("a", "2026-11-03", "published"), post("b", "2026-11-05"), post("c", "2026-12-01", "awaiting_approval")];
    expect(monthCounts(posts, NOW)).toEqual({ published: 1, total: 2 });
    expect(monthLine(posts, NOW)).toBe("November: 1 of 2 posts out.");
    expect(monthLine([post("x", "2026-12-01")], NOW)).toBeNull();
  });
});

describe("approving", () => {
  const paid = { role: "owner", billing: { status: "paid" } } as never;

  it("lets owners and editors with a running plan approve, and nobody else", () => {
    expect(canApprove(paid)).toBe(true);
    expect(canApprove({ role: "editor", billing: { status: "paid" } } as never)).toBe(true);
    expect(canApprove({ role: "viewer", billing: { status: "paid" } } as never)).toBe(false);
    expect(canApprove({ role: "owner", billing: { status: "lapsed" } } as never)).toBe(false);
  });

  it("sends only posts still awaiting approval, at most 50, and words the button", () => {
    const many = Array.from({ length: 60 }, (_, index) => post(`p${index}`, "2026-11-05", "awaiting_approval"));
    expect(approveAllIds([post("a", "2026-11-05"), post("b", "2026-11-05", "awaiting_approval")])).toEqual(["b"]);
    expect(approveAllIds(many)).toHaveLength(MAX_APPROVE);
    expect(approveAllLabel(1)).toBe("Approve");
    expect(approveAllLabel(4)).toBe("Approve all 4");
  });

  const ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
  const ID2 = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";

  it("accepts each id once, 1 to 50 of them, all UUIDs", () => {
    expect(approveIdsSchema.parse([ID, ID, ID2])).toEqual([ID, ID2]);
    expect(approveIdsSchema.safeParse([]).success).toBe(false);
    expect(approveIdsSchema.safeParse(["nope"]).success).toBe(false);
    const fifty = Array.from({ length: 51 }, (_, index) => `0199a1b2-c3d4-7e5f-8a9b-${String(index).padStart(12, "0")}`);
    expect(approveIdsSchema.safeParse(fifty).success).toBe(false);
    expect(approveIdsSchema.safeParse(fifty.slice(0, 50)).success).toBe(true);
  });

  it("says changed when fewer posts were approved than were shown", () => {
    expect(approvalOutcome(3, 3)).toBe("approved");
    expect(approvalOutcome(2, 3)).toBe("changed");
    expect(approvalOutcome(0, 1)).toBe("changed");
  });

  it("builds the cards with format, channel, day, picture and the change link", () => {
    const card = approvalCards([{ ...post("a", "2026-12-01", "awaiting_approval"), hasImage: true, format: "reel", channel: "instagram" }], NOW)[0];
    expect(card).toMatchObject({ kind: "Instagram reel", when: "Tue 1 Dec", imageSrc: "/social/images/a", changeHref: changePostHref("a") });
    expect(changePostHref("a")).toBe("/requests?new=1&kind=social&about=a");
  });
});

describe("post words", () => {
  it("names the channel and format, whichever is set", () => {
    expect(postKindLabel("post", "facebook")).toBe("Facebook post");
    expect(postKindLabel("story", "instagram")).toBe("Instagram story");
    expect(postKindLabel(null, "google_business")).toBe("Google profile");
    expect(postKindLabel("carousel", null)).toBe("Carousel");
    expect(postKindLabel(null, null)).toBe("Post");
  });

  it("uses the shared status words", () => {
    expect(postStatusKey("awaiting_approval")).toBe("needs_approval");
    expect(postStatusKey("published")).toBe("published");
  });
});

describe("monthCalendar", () => {
  it("covers November 2026 in six Monday-first weeks with each post on its day", () => {
    const weeks = monthCalendar([post("a", "2026-11-25"), post("out", "2026-12-01")], NOW);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toMatchObject({ date: "2026-10-26", inMonth: false });
    expect(weeks[0]?.[6]).toMatchObject({ date: "2026-11-01", day: 1, inMonth: true });
    expect(weeks.flat().find((day) => day.today)?.date).toBe("2026-11-04");
    expect(weeks.flat().find((day) => day.date === "2026-11-25")?.posts.map((entry) => entry.id)).toEqual(["a"]);
    expect(weeks.flat().some((day) => day.inMonth && day.posts.some((entry) => entry.id === "out"))).toBe(false);
  });
});

describe("adsView", () => {
  const snapshot = (over: Partial<{ adSpendCents: number | null; adBudgetCents: number | null; adEnquiries: number | null }> = {}) => ({
    adSpendCents: 900_000,
    adBudgetCents: 1_300_000,
    adEnquiries: 18,
    updatedAt: new Date("2026-11-23T05:00:00.000Z"),
    ...over,
  });

  it("is null, never zeros, when nothing is known", () => {
    expect(adsView({ snapshot: null, adCreditCents: 0, currency: "INR" })).toBeNull();
    expect(adsView({ snapshot: snapshot({ adSpendCents: null, adBudgetCents: null, adEnquiries: null }), adCreditCents: 0, currency: "INR" })).toBeNull();
  });

  it("gives spend against budget, leads and the cost per lead from the same figures", () => {
    expect(adsView({ snapshot: snapshot(), adCreditCents: 300_000, currency: "INR" })).toMatchObject({
      spent: "₹9,000",
      budget: "₹13,000",
      percent: 69,
      leads: 18,
      costPerLead: "₹500",
      adMoney: "₹3,000",
      updatedAt: new Date("2026-11-23T05:00:00.000Z"),
    });
  });

  it("clamps the percentage, hides it with no budget, and hides the cost per lead with no leads", () => {
    expect(adsView({ snapshot: snapshot({ adSpendCents: 2_000_000 }), adCreditCents: 0, currency: "INR" })?.percent).toBe(100);
    const noBudget = adsView({ snapshot: snapshot({ adBudgetCents: 0 }), adCreditCents: 0, currency: "INR" });
    expect(noBudget).toMatchObject({ percent: null, budget: null, budgetCents: null });
    expect(adsView({ snapshot: snapshot({ adEnquiries: 0 }), adCreditCents: 0, currency: "INR" })).toMatchObject({ leads: 0, costPerLead: null });
    expect(adsView({ snapshot: snapshot({ adSpendCents: null }), adCreditCents: 0, currency: "INR" })).toMatchObject({ spent: null, costPerLead: null, percent: null });
  });

  it("shows ad money alone, with no fake figures beside it", () => {
    expect(adsView({ snapshot: null, adCreditCents: 300_000, currency: "USD" })).toMatchObject({ adMoney: "$3,000", spent: null, leads: null, updatedAt: null });
  });
});

describe("accountRows", () => {
  it("orders the accounts, and links only https addresses", () => {
    const rows = accountRows([
      { platform: "whatsapp_business", handle: null, url: null, status: "not_connected", checkedAt: null },
      { platform: "facebook", handle: "Apex", url: "javascript:alert(1)", status: "connected", checkedAt: null },
      { platform: "instagram", handle: "@apex", url: "https://instagram.com/apex", status: "needs_attention", checkedAt: null },
    ]);
    expect(rows.map((row) => row.platform)).toEqual(["instagram", "facebook", "whatsapp_business"]);
    expect(rows[0]?.url).toBe("https://instagram.com/apex");
    expect(rows[1]?.url).toBeNull();
    expect(rows[2]?.label).toBe("WhatsApp Business");
  });
});

describe("socialTabs", () => {
  it("shows the number waiting on Content only when it is known and not zero", () => {
    expect(socialTabs(3)[1]).toMatchObject({ href: "/social/content", count: "3" });
    expect(socialTabs(0)[1]).not.toHaveProperty("count");
    expect(socialTabs(null)[1]).not.toHaveProperty("count");
    expect(socialTabs(null).map((tab) => tab.href)).toEqual(["/social", "/social/content", "/social/ads", "/social/accounts"]);
  });
});

describe("campaignRows", () => {
  const row = (id: string, name: string, over: Partial<Parameters<typeof campaignRows>[0][number]> = {}) => ({
    id,
    name,
    platform: "meta" as const,
    spendCents: 412_000,
    budgetCents: 500_000,
    leads: 9,
    updatedAt: new Date("2026-11-03T05:00:00.000Z"),
    ...over,
  });

  it("formats the money for the customer's currency and works out cost per lead from spend and leads", () => {
    expect(campaignRows([row("a", "Full body checkup")], "INR")[0]).toMatchObject({ platform: "Meta", spent: "₹4,120", budget: "₹5,000", leads: 9, costPerLead: "₹457.78" });
    expect(campaignRows([row("a", "Full body checkup", { spendCents: 35_000, budgetCents: 65_000, leads: 2 })], "USD")[0]).toMatchObject({ spent: "$350", budget: "$650", costPerLead: "$175" });
  });

  it("gives no cost per lead without leads or with zero leads, and keeps unknown budget and leads null", () => {
    expect(campaignRows([row("a", "A", { leads: null })], "INR")[0]).toMatchObject({ leads: null, costPerLead: null });
    expect(campaignRows([row("a", "A", { leads: 0 })], "INR")[0]).toMatchObject({ leads: 0, costPerLead: null });
    expect(campaignRows([row("a", "A", { budgetCents: null })], "INR")[0]?.budget).toBeNull();
  });

  it("sorts by name, ignoring case, without changing the list it was given", () => {
    const input = [row("1", "winter checkup"), row("2", "Diabetes screening")];
    expect(campaignRows(input, "INR").map((entry) => entry.name)).toEqual(["Diabetes screening", "winter checkup"]);
    expect(input[0]?.name).toBe("winter checkup");
  });

  it("reports the latest time any campaign was updated", () => {
    expect(campaignsUpdatedAt([])).toBeNull();
    const rows = campaignRows([row("1", "A", { updatedAt: new Date("2026-11-01T00:00:00Z") }), row("2", "B", { updatedAt: new Date("2026-11-03T00:00:00Z") })], "INR");
    expect(campaignsUpdatedAt(rows)).toEqual(new Date("2026-11-03T00:00:00Z"));
  });
});

describe("reachView", () => {
  const entered = new Date("2026-11-03T05:00:00.000Z");
  const base = { month: "2026-10-01", reach: null, followers: null, profileVisits: null, updatedAt: entered };

  it("is null when there is no row or no reach figure was entered", () => {
    expect(reachView(null, NOW)).toBeNull();
    expect(reachView(base, NOW)).toBeNull();
  });

  it("keeps only the figures entered, formatted, with the month and the date entered", () => {
    expect(reachView({ ...base, reach: 52_300, profileVisits: 0 }, NOW)).toEqual({ month: "October", reach: "52,300", followers: null, profileVisits: "0", enteredAt: entered });
  });

  it("adds the year to a month outside the current year", () => {
    expect(monthLabel("2025-12-01", NOW)).toBe("December 2025");
    expect(monthLabel("2026-01-01", NOW)).toBe("January");
  });
});
