// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WrittenBatch, WrittenPost } from "@/lib/social/ai";
import type { ReviewGroup } from "@/lib/social/review-cards";
import { button, buttonsNamed, click, mount, type, type Mounted } from "./dom-test";
import { PostsPanel } from "./posts-panel";

const { decideBatch, decidePoster, drawBatch } = vi.hoisted(() => ({ decideBatch: vi.fn(), decidePoster: vi.fn(), drawBatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/social/review/actions", () => ({ decideBatchAction: decideBatch, decidePosterAction: decidePoster, drawBatchAction: drawBatch }));

const written = (id: string, state: WrittenPost["state"], date: string, notDrawn: WrittenPost["notDrawn"] = null): WrittenPost => ({ id, headline: `Headline ${id}`, caption: `Words ${id}`, captions: { instagram: `Words ${id}` }, state, edited: false, advice: null, date, notDrawn });

const batch = (weeks: WrittenBatch["weeks"]): WrittenBatch => ({
  id: "week-01.json",
  createdAt: "2026-11-12T10:00:00Z",
  networks: ["instagram"],
  posts: [written("p1", "kept", "2026-11-16"), written("p2", "pending", "2026-11-23"), written("p3", "kept", "2026-11-23")],
  rules: {},
  weeks,
});

const group = (one: WrittenBatch): ReviewGroup => ({
  batchId: one.id,
  batch: one,
  cards: one.posts.map((post) => ({ key: `${one.id}/${post.id}`, batchId: one.id, postId: post.id, headline: post.headline, written: post, pictures: [], states: [] })),
});

let view: Mounted;
beforeEach(() => {
  vi.resetAllMocks();
  decideBatch.mockResolvedValue({ status: "saved" });
  drawBatch.mockResolvedValue({ status: "saved" });
  view = mount();
});
afterEach(() => view.unmount());

const week = (name: string): HTMLElement => {
  const found = view.container.querySelector<HTMLElement>(`section[aria-label="${name}"]`);
  if (found === null) throw new Error(`No week "${name}"`);
  return found;
};
const weeksShown = (): number => view.container.querySelectorAll('section[aria-label^="Week of "]').length;
const text = (): string => view.container.textContent ?? "";
const sentForm = (action: ReturnType<typeof vi.fn>): FormData => action.mock.calls[0]?.[0] as FormData;

describe("PostsPanel: a plan over several weeks", () => {
  const weeks: WrittenBatch["weeks"] = [
    { from: "2026-11-16", to: "2026-11-22", state: "drawn", postIds: ["p1"], notDrawn: [], missingDays: [] },
    { from: "2026-11-23", to: "2026-11-29", state: "waiting", postIds: ["p2", "p3"], notDrawn: [], missingDays: [] },
  ];

  it("shows each week with where it stands, and a draw button only for the week that is still open", async () => {
    await view.render(<PostsPanel groups={[group(batch(weeks))]} reasons={[]} />);
    const first = week("Week of 16 Nov to 22 Nov");
    const second = week("Week of 23 Nov to 29 Nov");
    expect(first.textContent).toContain("Drawn, choices are final");
    expect(buttonsNamed(first, "Draw this week's pictures")).toHaveLength(0);
    expect(second.textContent).toContain("Open: keep or drop, then draw");
    expect(second.textContent).toContain("1 of 2 kept");
    expect(buttonsNamed(second, "Draw this week's pictures")).toHaveLength(1);
  });

  it("asks for that week only, naming its Monday", async () => {
    await view.render(<PostsPanel groups={[group(batch(weeks))]} reasons={[]} />);
    await click(button(view.container, "Draw this week's pictures"));
    expect(drawBatch).toHaveBeenCalledTimes(1);
    expect(sentForm(drawBatch).get("batchId")).toBe("week-01.json");
    expect(sentForm(drawBatch).get("week")).toBe("2026-11-23");
  });

  it("does not offer a draw for a week with nothing kept", async () => {
    const none = batch([{ from: "2026-11-23", to: "2026-11-29", state: "waiting", postIds: ["p2"], notDrawn: [], missingDays: [] }]);
    await view.render(<PostsPanel groups={[group({ ...none, posts: [written("p2", "pending", "2026-11-23")] })]} reasons={[]} />);
    expect(button(view.container, "Draw this week's pictures").disabled).toBe(true);
  });

  it("says a week that passed before it was drawn, and offers no draw for it", async () => {
    await view.render(<PostsPanel groups={[group(batch([{ from: "2026-11-16", to: "2026-11-22", state: "lapsed", postIds: ["p1", "p2", "p3"], notDrawn: [], missingDays: [] }]))]} reasons={[]} />);
    expect(text()).toContain("Passed before its pictures were drawn");
    expect(buttonsNamed(view.container, "Draw this week's pictures")).toHaveLength(0);
  });

  it("lists a whole month on one page: 4 weeks of 5 posts, each open week with its own draw button, the first one already drawn", async () => {
    const mondays = ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"];
    const sundays = ["2026-11-22", "2026-11-29", "2026-12-06", "2026-12-13"];
    const posts = mondays.flatMap((monday, w) => [0, 1, 2, 3, 4].map((d) => written(`w${w}d${d}`, w === 0 ? "kept" : "pending", monday)));
    const month: WrittenBatch = {
      id: "week-01.json",
      createdAt: "2026-11-12T10:00:00Z",
      networks: ["instagram"],
      posts,
      rules: {},
      weeks: mondays.map((from, w) => ({ from, to: sundays[w] as string, state: w === 0 ? "drawn" : "waiting", postIds: [0, 1, 2, 3, 4].map((d) => `w${w}d${d}`), notDrawn: [], missingDays: [] })),
    };
    await view.render(<PostsPanel groups={[group(month)]} reasons={[]} />);
    expect(weeksShown()).toBe(4);
    for (const name of ["Week of 23 Nov to 29 Nov", "Week of 30 Nov to 6 Dec", "Week of 7 Dec to 13 Dec"]) {
      expect(week(name).querySelectorAll("li > *").length).toBeGreaterThan(0);
      expect(buttonsNamed(week(name), "Draw this week's pictures")).toHaveLength(1);
    }
    expect(buttonsNamed(week("Week of 16 Nov to 22 Nov"), "Draw this week's pictures")).toHaveLength(0);
    expect(buttonsNamed(view.container, "Draw this week's pictures")).toHaveLength(3);
  });

  it("warns on a topic whose headline the posting service calls weak, so it is fixed before the draw", async () => {
    const topic = { ...written("p2", "pending", "2026-11-23"), advice: "weak headline: it tells the reader nothing specific (A broad promise.)" };
    await view.render(<PostsPanel groups={[group({ ...batch(null), posts: [topic] })]} reasons={[]} />);
    expect(text()).toContain("This headline is weak, so no picture will be drawn for it");
  });

  it("changes only the headline when the customer saves a new one", async () => {
    await view.render(<PostsPanel groups={[group({ ...batch(null), posts: [written("p2", "pending", "2026-11-23")] })]} reasons={[]} />);
    await click(button(view.container, "Change the headline"));
    const field = view.container.querySelector<HTMLInputElement>("#headline-week-01\\.json-p2") as HTMLInputElement;
    expect(field.value).toBe("Headline p2");
    await type(field, "Order Diwali boxes by Friday");
    await click(button(view.container, "Save headline"));
    expect(decideBatch).toHaveBeenCalledTimes(1);
    const form = sentForm(decideBatch);
    expect([form.get("action"), form.get("headline"), form.get("postId"), form.get("caption")]).toEqual(["edit-headline", "Order Diwali boxes by Friday", "p2", null]);
  });

  it("keeps a kept topic that got no picture open, says why in the service's own words, and retries only the missing ones", async () => {
    const reason = { code: "HEADLINE_TOO_WEAK", message: "This headline is too weak to draw. Change it or drop it." };
    const drawnWeek: WrittenBatch["weeks"] = [{ from: "2026-11-23", to: "2026-11-29", state: "drawn", postIds: ["p2", "p3"], notDrawn: [{ postId: "p2", ...reason }], missingDays: [] }];
    const one: WrittenBatch = { ...batch(drawnWeek), posts: [written("p2", "kept", "2026-11-23", reason), written("p3", "kept", "2026-11-23")] };
    await view.render(<PostsPanel groups={[group(one)]} reasons={[]} />);
    expect(text()).toContain("No picture was made for this post. This headline is too weak to draw. Change it or drop it.");
    // The topic with no picture can still be changed; the one with a picture is final.
    expect(buttonsNamed(view.container, "Change the headline")).toHaveLength(1);
    await click(button(view.container, "Draw the missing pictures"));
    expect(drawBatch).toHaveBeenCalledTimes(1);
    expect([sentForm(drawBatch).get("week"), sentForm(drawBatch).get("retry")]).toEqual(["2026-11-23", "1"]);
  });

  it("says a week where nothing was drawn is not final, and offers to draw again", async () => {
    const reason = { code: "NO_PICTURE", message: "No picture could be made for it." };
    const one: WrittenBatch = { ...batch([{ from: "2026-11-23", to: "2026-11-29", state: "not_drawn", postIds: ["p3"], notDrawn: [{ postId: "p3", ...reason }], missingDays: [] }]), posts: [written("p3", "kept", "2026-11-23", reason)] };
    await view.render(<PostsPanel groups={[group(one)]} reasons={[]} />);
    expect(text()).toContain("No picture was made: change or drop the topics, then draw again");
    expect(buttonsNamed(view.container, "Draw the missing pictures")).toHaveLength(1);
    expect(text()).not.toContain("Drawn, choices are final");
  });

  it("says a week with no posts could not be written, and which days of a week have none", async () => {
    const two: WrittenBatch["weeks"] = [
      { from: "2026-11-30", to: "2026-12-06", state: "waiting", postIds: ["p3"], notDrawn: [], missingDays: ["2026-12-03", "2026-12-04"] },
      { from: "2026-12-07", to: "2026-12-13", state: "empty", postIds: [], notDrawn: [], missingDays: ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11"] },
    ];
    await view.render(<PostsPanel groups={[group({ ...batch(two), posts: [written("p3", "kept", "2026-11-30")] })]} reasons={[]} />);
    expect(text()).toContain("No posts could be written for this week");
    expect(text()).toContain("No post could be written for Thu 3 Dec, Fri 4 Dec.");
    expect(buttonsNamed(week("Week of 7 Dec to 13 Dec"), "Draw this week's pictures")).toHaveLength(0);
  });

  it("says in plain words where each channel's picture stands when it has none yet", async () => {
    const base = group({ ...batch(null), posts: [written("p3", "kept", "2026-11-23")] });
    const card = {
      ...(base.cards[0] as ReviewGroup["cards"][number]),
      states: [
        { network: "instagram" as const, status: "written", pictureState: "waiting", drawsOn: "2026-11-19" },
        { network: "facebook" as const, status: "written", pictureState: "needs_connection" },
        { network: "linkedin" as const, status: "written", pictureState: "limit_reached" },
        { network: "google" as const, status: "pending", pictureState: "ready" },
      ],
    };
    await view.render(<PostsPanel groups={[{ ...base, cards: [card] }]} reasons={[]} />);
    expect(text()).toContain("Instagram: the picture is drawn on Thursday 19 November.");
    expect(text()).toContain("Connect Facebook to get a picture for it.");
    expect(text()).toContain("LinkedIn: no pictures are left this week. It is drawn as soon as there is room.");
    expect(text()).not.toContain("Google Business:");
  });

  it("keeps showing a batch drawn in one piece as before, with one draw button", async () => {
    await view.render(<PostsPanel groups={[group(batch(null))]} reasons={[]} />);
    expect(buttonsNamed(view.container, "Draw my pictures")).toHaveLength(1);
    expect(weeksShown()).toBe(0);
    expect(decideBatch).not.toHaveBeenCalled();
    expect(decidePoster).not.toHaveBeenCalled();
  });
});
