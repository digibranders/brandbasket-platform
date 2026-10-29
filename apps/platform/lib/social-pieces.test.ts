import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/social/actions", () => ({ approvePostsAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-actions", () => ({ saveSetupItemAction: vi.fn() }));

import { ApproveBar } from "@/components/social/approve-bar";
import { PostCard } from "@/components/social/post-card";
import { SocialView } from "@/components/social/social-view";
import { WeekList } from "@/components/social/week-list";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import type { SocialData } from "@/lib/server/social";
import type { PostView } from "@/lib/social/week";

const ID = "0192f3c4-0000-7000-8000-000000000001";

function post(overrides: Partial<PostView> = {}): PostView {
  return { id: ID, title: "Year-end check-up", caption: "Book before the 31st.", dueOn: "2026-12-01", status: "awaiting_approval", hasImage: true, linkUrl: null, ...overrides };
}

const text = (element: ReturnType<typeof createElement>): string => renderToStaticMarkup(element).replaceAll("<!-- -->", "");
const count = (html: string, part: string): number => html.split(part).length - 1;

function card(overrides: Partial<PostView> = {}, props: { showApprove?: boolean; waiting?: boolean; total?: number } = {}): string {
  return text(createElement(PostCard, { post: post(overrides), position: 0, total: props.total ?? 4, waiting: props.waiting ?? true, showApprove: props.showApprove ?? false }));
}

it("shows a post with a picture as its picture, named by the title, with its day and caption", () => {
  const html = card();
  expect(html).toContain(`src="/deliverable-images/${ID}"`);
  expect(html).toContain('alt="Year-end check-up"');
  expect(html).toContain("Tue 1 Dec");
  expect(html).toContain("Book before the 31st.");
  expect(html).toContain("font-figure");
});

it("sets the title on a sunken square when there is no picture", () => {
  const html = card({ hasImage: false });
  expect(html).not.toContain("<img");
  expect(html).toContain("bg-sunken");
  expect(html).toContain("Year-end check-up");
});

it("links Change to Ask for a change with the post", () => {
  expect(card()).toContain(`href="/requests/new?kind=social&amp;about=${ID}"`);
  expect(card()).toContain("Change");
});

it("shows Approve only when asked, as a soft button posting that one id", () => {
  expect(card({}, { showApprove: false })).not.toContain("Approve");
  const html = card({}, { showApprove: true });
  expect(html).toContain("Approve");
  expect(count(html, SOFT_BUTTON)).toBe(1);
  expect(html).toContain(`<input type="hidden" name="ids" value="${ID}"/>`);
});

it("says where a waiting post sits in the run, only when several wait", () => {
  expect(card({}, { total: 4 })).toContain("1 of 4");
  expect(card({}, { total: 1 })).not.toContain("1 of 1");
  expect(card({ status: "published" }, { waiting: false })).not.toContain("1 of 4");
});

function bar(count: number): string {
  const posts = Array.from({ length: count }, (_, index) => post({ id: `0192f3c4-0000-7000-8000-00000000010${index}` }));
  return text(createElement(ApproveBar, { posts }));
}

it("posts one hidden id per waiting post and has the one dark button", () => {
  const html = bar(4);
  expect(count(html, 'type="hidden" name="ids"')).toBe(4);
  expect(count(html, DARK_BUTTON)).toBe(1);
  expect(html).toContain("Nothing goes out until you approve it.");
});

it("labels the button Approve for one post and Approve all 4 for four", () => {
  expect(bar(1)).toContain(">Approve</button>");
  expect(bar(4)).toContain("Approve all 4");
});

it("lists the week with each day, the status word and the title", () => {
  const html = text(
    createElement(WeekList, {
      posts: [
        post({ id: "a", status: "planned", dueOn: "2026-11-30", title: "Plan one" }),
        post({ id: "b", status: "awaiting_approval", dueOn: "2026-12-01" }),
        post({ id: "c", status: "published", dueOn: "2026-12-02", title: "Out already" }),
        post({ id: "d", status: "approved", dueOn: "2026-12-03", title: "Ready" }),
      ],
    }),
  );
  expect(html).toContain("This week");
  for (const word of ["Planned", "Needs your OK", "Approved", "Published"]) expect(html).toContain(word);
  for (const title of ["Plan one", "Year-end check-up", "Out already", "Ready"]) expect(html).toContain(title);
  expect(html).toContain("Mon 30 Nov");
});

it("says so when nothing is planned this week, and what will appear", () => {
  const html = text(createElement(WeekList, { posts: [] }));
  expect(html).toContain("Nothing is planned for this week yet.");
  expect(html).toContain("Posts we plan for the week appear here.");
});

const NOW = new Date("2026-12-01T05:00:00.000Z");
const WAITING = [post({ id: "w1", dueOn: "2026-12-01" }), post({ id: "w2", dueOn: "2026-12-02", title: "Brushes" }), post({ id: "w3", dueOn: "2026-12-03", title: "Meet the team" })];

function view(overrides: Partial<SocialData> = {}, notice: { ok: boolean; text: string } | null = null): string {
  const data: SocialData = { posts: WAITING, monthLine: "December: 0 of 3 posts out.", ads: null, report: null, month: "December", ...overrides };
  return text(createElement(SocialView, { data, notice, now: NOW }));
}

it("with posts waiting, says how many and by when, shows each and has the one dark button", () => {
  const html = view();
  expect(html).toContain("3 posts need your OK by Tue 1 Dec");
  for (const title of ["Year-end check-up", "Brushes", "Meet the team"]) expect(html).toContain(title);
  expect(html).toContain("December: 0 of 3 posts out.");
  expect(count(html, DARK_BUTTON)).toBe(1);
  expect(html).toContain("Approve all 3");
  expect(html).not.toContain("No posts are waiting for you.");
});

it("keeps a line under the title when there is no month line yet", () => {
  expect(view({ monthLine: null })).toContain("Your posts and ads, and what they have brought in.");
  expect(view()).not.toContain("Your posts and ads, and what they have brought in.");
});

it("with nothing waiting, says so, says what will appear, and offers Ask for a change as the one dark button", () => {
  const html = view({ posts: [post({ status: "published" })] });
  expect(html).toContain("No posts are waiting for you.");
  expect(html).toContain("When a post is ready, it appears here as it will look on Instagram and Facebook");
  expect(html).not.toContain("Approve");
  expect(count(html, DARK_BUTTON)).toBe(1);
  expect(html).toContain('href="/requests/new?kind=social"');
});

it("sits in the page frame: the title, the month line, and the ads and the week in the aside", () => {
  const html = view({ ads: { spent: "₹6,240", percent: null, enquiries: null, adMoney: null } });
  expect(html).toContain(">Social &amp; Ads</h1>");
  expect(html).toContain("@container");
  expect(html.indexOf("Ads in December")).toBeGreaterThan(html.indexOf("Approve all 3"));
  expect(html.indexOf("This week")).toBeGreaterThan(html.indexOf("Ads in December"));
});

it("shows the ads panel with the figures it has and leaves out a line whose figure is not known", () => {
  const full = view({ ads: { spent: "₹6,240 of ₹10,000", percent: 62, enquiries: 21, adMoney: "₹1,500" } });
  expect(full).toContain("Ads in December");
  for (const part of ["Spent", "₹6,240 of ₹10,000", "Enquiries from ads", "21", "Ad money added by us", "₹1,500"]) expect(full).toContain(part);
  const partial = view({ ads: { spent: "₹6,240", percent: null, enquiries: null, adMoney: null } });
  expect(partial).toContain("Spent");
  for (const part of ["Enquiries from ads", "Ad money added by us"]) expect(partial).not.toContain(part);
  expect(view({ ads: null })).not.toContain("Ads in December");
});

it("offers the monthly report only when there is one, in a new tab", () => {
  expect(view()).not.toContain("Monthly report");
  const html = view({ report: "https://reports.example.com/december" });
  expect(html).toContain("Monthly report");
  expect(html).toContain('href="https://reports.example.com/december"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
});

it("says what just happened when there is a notice, as a problem when it is one", () => {
  expect(view({}, { ok: true, text: "Approved. Thank you, we will publish on the dates shown." })).toContain('role="status"');
  expect(view({}, { ok: false, text: "We could not save that. Try again." })).toContain('role="alert"');
});

it("never uses a dash in what it says", () => {
  const html = view({ ads: { spent: "₹6,240 of ₹10,000", percent: 62, enquiries: 21, adMoney: "₹1,500" }, report: "https://reports.example.com/december" }) + card({}, { showApprove: true }) + bar(4) + text(createElement(WeekList, { posts: [post()] }));
  expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});
