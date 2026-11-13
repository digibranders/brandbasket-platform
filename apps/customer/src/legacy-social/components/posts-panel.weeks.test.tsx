import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WrittenBatch, WrittenPost } from "@/legacy-social/lib/social/ai";
import type { ReviewGroup } from "@/legacy-social/lib/social/review-cards";
import { decideBatchAction, decidePosterAction, drawBatchAction } from "@/legacy-social/review-actions";
import { PostsPanel } from "./posts-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/legacy-social/review-actions", () => ({ decideBatchAction: vi.fn(async () => ({ status: "saved" })), decidePosterAction: vi.fn(), drawBatchAction: vi.fn(async () => ({ status: "saved" })) }));

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PostsPanel: a plan over several weeks", () => {
  const weeks: WrittenBatch["weeks"] = [
    { from: "2026-11-16", to: "2026-11-22", state: "drawn", postIds: ["p1"], notDrawn: [], missingDays: [] },
    { from: "2026-11-23", to: "2026-11-29", state: "waiting", postIds: ["p2", "p3"], notDrawn: [], missingDays: [] },
  ];

  it("shows each week with where it stands, and a draw button only for the week that is still open", () => {
    render(<PostsPanel groups={[group(batch(weeks))]} reasons={[]} />);
    const first = screen.getByRole("region", { name: "Week of 16 Nov to 22 Nov" });
    const second = screen.getByRole("region", { name: "Week of 23 Nov to 29 Nov" });
    expect(within(first).getByText("Drawn, choices are final")).toBeTruthy();
    expect(within(first).queryByRole("button", { name: /Draw this week/ })).toBeNull();
    expect(within(second).getByText("Open: keep or drop, then draw")).toBeTruthy();
    expect(within(second).getByText(/1 of 2 kept/)).toBeTruthy();
    expect(within(second).getByRole("button", { name: "Draw this week's pictures" })).toBeTruthy();
  });

  it("asks for that week only, naming its Monday", async () => {
    render(<PostsPanel groups={[group(batch(weeks))]} reasons={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw this week's pictures" }));
    await waitFor(() => expect(vi.mocked(drawBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(drawBatchAction).mock.calls[0]?.[0] as FormData;
    expect(form.get("batchId")).toBe("week-01.json");
    expect(form.get("week")).toBe("2026-11-23");
  });

  it("does not offer a draw for a week with nothing kept", () => {
    const none = batch([{ from: "2026-11-23", to: "2026-11-29", state: "waiting", postIds: ["p2"], notDrawn: [], missingDays: [] }]);
    render(<PostsPanel groups={[group({ ...none, posts: [written("p2", "pending", "2026-11-23")] })]} reasons={[]} />);
    expect((screen.getByRole("button", { name: "Draw this week's pictures" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says a week that passed before it was drawn, and offers no draw for it", () => {
    render(<PostsPanel groups={[group(batch([{ from: "2026-11-16", to: "2026-11-22", state: "lapsed", postIds: ["p1", "p2", "p3"], notDrawn: [], missingDays: [] }]))]} reasons={[]} />);
    expect(screen.getByText("Passed before its pictures were drawn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Draw this week/ })).toBeNull();
  });

  it("lists a whole month on one page: 4 weeks of 5 posts, each week with its own draw button, the first one already drawn", () => {
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
    render(<PostsPanel groups={[group(month)]} reasons={[]} />);
    expect(screen.getAllByRole("region", { name: /^Week of / })).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 3 }).filter((one) => /^Headline w\d+d\d$/.test(one.textContent ?? ""))).toHaveLength(20);
    for (const name of ["Week of 23 Nov to 29 Nov", "Week of 30 Nov to 6 Dec", "Week of 7 Dec to 13 Dec"]) {
      const week = screen.getByRole("region", { name });
      expect(within(week).getAllByRole("listitem")).toHaveLength(5);
      expect(within(week).getByRole("button", { name: "Draw this week's pictures" })).toBeTruthy();
    }
    expect(within(screen.getByRole("region", { name: "Week of 16 Nov to 22 Nov" })).queryByRole("button", { name: /Draw this week/ })).toBeNull();
  });

  it("warns on a topic whose headline the posting service calls weak, so it is fixed before the draw", () => {
    const weak = batch(null);
    const topic = { ...written("p2", "pending", "2026-11-23"), advice: "weak headline: it tells the reader nothing specific (A broad promise.)" };
    render(<PostsPanel groups={[group({ ...weak, posts: [topic] })]} reasons={[]} />);
    expect(screen.getByText(/This headline is weak, so no picture will be drawn for it/)).toBeTruthy();
  });

  it("changes only the headline when the customer saves a new one", async () => {
    render(<PostsPanel groups={[group({ ...batch(null), posts: [written("p2", "pending", "2026-11-23")] })]} reasons={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Change the headline" }));
    const field = screen.getByLabelText(/^Headline/) as HTMLInputElement;
    expect(field.value).toBe("Headline p2");
    fireEvent.change(field, { target: { value: "Order Diwali boxes by Friday" } });
    fireEvent.click(screen.getByRole("button", { name: "Save headline" }));
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect(form.get("action")).toBe("edit-headline");
    expect(form.get("headline")).toBe("Order Diwali boxes by Friday");
    expect(form.get("postId")).toBe("p2");
    expect(form.get("caption")).toBeNull();
  });

  it("keeps a kept topic that got no picture open, says why in the service's own words, and retries only the missing ones", async () => {
    const reason = { code: "HEADLINE_TOO_WEAK", message: "This headline is too weak to draw. Change it or drop it." };
    const drawnWeek: WrittenBatch["weeks"] = [{ from: "2026-11-23", to: "2026-11-29", state: "drawn", postIds: ["p2", "p3"], notDrawn: [{ postId: "p2", ...reason }], missingDays: [] }];
    const one: WrittenBatch = { ...batch(drawnWeek), posts: [written("p2", "kept", "2026-11-23", reason), written("p3", "kept", "2026-11-23")] };
    render(<PostsPanel groups={[group(one)]} reasons={[]} />);
    expect(screen.getByText(/No picture was made for this post\. This headline is too weak to draw\. Change it or drop it\./)).toBeTruthy();
    // The topic with no picture can still be changed; the one with a picture is final.
    expect(screen.getAllByRole("button", { name: "Change the headline" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Draw the missing pictures" }));
    await waitFor(() => expect(vi.mocked(drawBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(drawBatchAction).mock.calls[0]?.[0] as FormData;
    expect(form.get("week")).toBe("2026-11-23");
    expect(form.get("retry")).toBe("1");
  });

  it("says a week where nothing was drawn is not final, and offers to draw again", () => {
    const reason = { code: "NO_PICTURE", message: "No picture could be made for it." };
    const one: WrittenBatch = { ...batch([{ from: "2026-11-23", to: "2026-11-29", state: "not_drawn", postIds: ["p3"], notDrawn: [{ postId: "p3", ...reason }], missingDays: [] }]), posts: [written("p3", "kept", "2026-11-23", reason)] };
    render(<PostsPanel groups={[group(one)]} reasons={[]} />);
    expect(screen.getByText("No picture was made: change or drop the topics, then draw again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draw the missing pictures" })).toBeTruthy();
    expect(screen.queryByText("Drawn, choices are final")).toBeNull();
  });

  it("says a week with no posts could not be written, and which days of a week have none", () => {
    const two: WrittenBatch["weeks"] = [
      { from: "2026-11-30", to: "2026-12-06", state: "waiting", postIds: ["p3"], notDrawn: [], missingDays: ["2026-12-03", "2026-12-04"] },
      { from: "2026-12-07", to: "2026-12-13", state: "empty", postIds: [], notDrawn: [], missingDays: ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11"] },
    ];
    render(<PostsPanel groups={[group({ ...batch(two), posts: [written("p3", "kept", "2026-11-30")] })]} reasons={[]} />);
    expect(screen.getByText("No posts could be written for this week")).toBeTruthy();
    expect(screen.getByText("No posts could be written for this week.")).toBeTruthy();
    expect(screen.getByText(/No post could be written for Thu 3 Dec, Fri 4 Dec\./)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Week of 7 Dec to 13 Dec" })).queryByRole("button", { name: /Draw this week/ })).toBeNull();
  });

  it("says in plain words where each channel's picture stands when it has none yet", () => {
    const one = batch(null);
    const withStates: ReviewGroup = { ...group({ ...one, posts: [written("p3", "kept", "2026-11-23")] }) };
    const card = { ...(withStates.cards[0] as ReviewGroup["cards"][number]), states: [
      { network: "instagram" as const, status: "written", pictureState: "waiting", drawsOn: "2026-11-19" },
      { network: "facebook" as const, status: "written", pictureState: "needs_connection" },
      { network: "linkedin" as const, status: "written", pictureState: "limit_reached" },
      { network: "google" as const, status: "pending", pictureState: "ready" },
    ] };
    render(<PostsPanel groups={[{ ...withStates, cards: [card] }]} reasons={[]} />);
    expect(screen.getByText("Instagram: the picture is drawn on Thursday 19 November.")).toBeTruthy();
    expect(screen.getByText("Connect Facebook to get a picture for it.")).toBeTruthy();
    expect(screen.getByText("LinkedIn: no pictures are left this week. It is drawn as soon as there is room.")).toBeTruthy();
    expect(screen.queryByText(/Google Business:/)).toBeNull();
  });

  it("keeps showing a batch drawn in one piece as before, with one draw button", () => {
    render(<PostsPanel groups={[group(batch(null))]} reasons={[]} />);
    expect(screen.getByRole("button", { name: "Draw my pictures" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Week of/ })).toBeNull();
    expect(vi.mocked(decideBatchAction)).not.toHaveBeenCalled();
    expect(vi.mocked(decidePosterAction)).not.toHaveBeenCalled();
  });
});
