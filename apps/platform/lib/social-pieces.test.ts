import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/social/actions", () => ({ approvePostsAction: vi.fn() }));

import { ApproveBar } from "@/components/social/approve-bar";
import { PostCard } from "@/components/social/post-card";
import { WeekList } from "@/components/social/week-list";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
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

it("says so when nothing is planned this week", () => {
  expect(text(createElement(WeekList, { posts: [] }))).toContain("Nothing is planned for this week yet.");
});

it("never uses a dash in what it says", () => {
  const html = card({}, { showApprove: true }) + bar(4) + text(createElement(WeekList, { posts: [post()] }));
  expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});
