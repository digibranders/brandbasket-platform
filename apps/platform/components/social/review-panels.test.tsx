import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/social/review/actions", () => ({ decideBatchAction: vi.fn(), drawBatchAction: vi.fn(), decidePosterAction: vi.fn(), addNetworkAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/social/brand-actions", () => ({ addBrandAction: vi.fn(), archiveBrandAction: vi.fn(), selectBrandAction: vi.fn() }));

import { ReviewView } from "@/components/social/review-view";
import { PosterTile } from "@/components/social/poster-tile";
import { PostsPanel } from "@/components/social/posts-panel";
import { groupReview } from "@/lib/social/review-cards";
import type { Poster, WrittenBatch } from "@/lib/social/ai";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(element);
const noDash = (html: string): void => expect(html).not.toMatch(/[–—]/);

const batch = (over: Partial<WrittenBatch> = {}): WrittenBatch => ({
  id: "week-05",
  createdAt: "2026-11-11T10:00:00Z",
  networks: ["instagram", "linkedin"],
  rules: { instagram: { maxCaption: 600, recommendedMin: 100, recommendedMax: 300, maxHashtags: 5 } },
  posts: [
    { id: "p1", headline: "Diwali boxes", caption: "Main", captions: { instagram: "Short words", linkedin: "Longer words" }, state: "kept", edited: false, advice: "A short headline reads better" },
    { id: "p2", headline: "Delivery", caption: "Main two", captions: { instagram: "Two", linkedin: "Two long" }, state: "dropped", edited: true, advice: null },
  ],
  ...over,
});

const poster = (over: Partial<Poster>): Poster => ({ id: "v1", batchId: "week-05", postId: "p1", network: "instagram", shape: "square", width: 1024, height: 1024, headline: "Diwali boxes", caption: "x", versionNumber: 1, status: "pending", canRedraw: false, redrawsLeft: 0, createdAt: "2026-11-11T10:00:00Z", ...over });
const reasons = ["weak_copy", "style", "other"];
const panel = (batches: readonly WrittenBatch[], pictures: readonly Poster[] = [], drawing: readonly string[] = []): string => render(createElement(PostsPanel, { groups: groupReview(batches, pictures), drawing, reasons }));
const tile = (one: Poster): string => render(createElement(PosterTile, { poster: one, reasons, onNotice: vi.fn() }));

describe("PostsPanel, the words of each post", () => {
  it("shows each post with its words for the first network, a tab for each network, and the choices", () => {
    const html = panel([batch()]);
    expect(html).toContain("Diwali boxes");
    expect(html).toContain("Short words");
    expect(html).not.toContain("Longer words");
    expect(html).toContain("Instagram");
    expect(html).toContain("LinkedIn");
    expect(html).toContain("Change the words");
    expect(html).toContain("changed by you");
    expect(html).toContain("A short headline reads better");
    expect(html).toContain("1 of 2 kept. Once you ask, these choices are final.");
    noDash(html);
  });

  it("gives the choices a white fill so they show on the grey card, not as plain text", () => {
    expect(panel([batch()])).toMatch(/<button[^>]*class="[^"]*bg-surface[^"]*"[^>]*>Keep|<button[^>]*class="[^"]*bg-surface[^"]*"[^>]*>Kept/);
  });

  it("offers the pictures only once something is kept, as the one dark button of a batch", () => {
    const none = panel([batch({ posts: [{ id: "p2", headline: "Delivery", caption: "x", captions: {}, state: "dropped", edited: false, advice: null }] })]);
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*>Draw my pictures/);
    expect(panel([batch()])).not.toMatch(/<button[^>]*disabled=""[^>]*>Draw my pictures/);
  });

  it("makes a batch final once its pictures were asked for, and shows the drawing on the post that was kept", () => {
    const html = panel([batch()], [], ["week-05"]);
    expect(html).toContain("and final. Each picture appears on its post.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Drawing your pictures/);
    expect(html).toContain("They will appear here when they are ready.");
    expect(html.match(/They will appear here when they are ready\./g)).toHaveLength(1);
    expect(html).not.toContain(">Change the words<");
    expect(html).not.toContain(">Drop<");
  });

  it("says when nothing is waiting", () => {
    expect(panel([])).toContain("No posts are waiting for you.");
  });
});

describe("PostsPanel, the pictures on a post's own card", () => {
  it("puts a post's pictures on its card, each with where it stands, and a way to view them", () => {
    const html = panel([batch()], [poster({}), poster({ id: "v2", network: "linkedin", width: 1200, height: 628 })]);
    expect(html.indexOf("Diwali boxes")).toBeLessThan(html.indexOf('<img src="/api/social-posters/image?id=v1"'));
    expect(html).toContain("/api/social-posters/image?id=v1");
    expect(html).toContain("Waiting for you");
    expect(html).toContain("View pictures");
    expect(html).not.toContain("Hide pictures");
    expect(html.match(/<h3/g)).toHaveLength(2);
    noDash(html);
  });

  it("says View picture for a post with one, and gives one dark button to approve every network only when more than one waits", () => {
    expect(panel([batch()], [poster({})])).toContain("View picture");
    expect(panel([batch()], [poster({})])).not.toContain("Approve all");
    expect(panel([batch()], [poster({}), poster({ id: "v2", network: "linkedin" })])).toContain("Approve all 2");
  });

  it("keeps the pictures of a drawn batch, which is no longer listed, under their headline", () => {
    const html = panel([], [poster({ headline: "Fresh laddoos" }), poster({ id: "v2", network: "linkedin", headline: "Fresh laddoos" })]);
    expect(html).toContain("Fresh laddoos");
    expect(html).toContain("View pictures");
    expect(html).not.toContain("Draw my pictures");
  });

  it("shows an approved picture on its post as approved", () => {
    expect(panel([], [poster({ status: "approved" })])).toContain("Approved");
  });
});

describe("a picture, opened", () => {
  it("shows the picture through our own route, with approve, send back and a way to ask for another", () => {
    const html = tile(poster({ canRedraw: true, redrawsLeft: 1 }));
    expect(html).toContain("/api/social-posters/image?id=v1");
    expect(html).toContain("Approve");
    expect(html).toContain("Send it back");
    expect(html).toContain("Draw another");
    expect(html).toContain("Waiting for you");
    noDash(html);
  });

  it("says when a picture is the same drawing as another network's, and how to get a different one", () => {
    expect(tile(poster({ network: "facebook", sharedWith: ["instagram"], canRedraw: true, redrawsLeft: 1 }))).toContain("Same picture as Instagram. Use Draw another for a different one.");
    expect(tile(poster({ network: "instagram", sharedWith: ["facebook", "google"], canRedraw: true, redrawsLeft: 1 }))).toContain("Same picture as Facebook and Google Business. Use Draw another");
    expect(tile(poster({ network: "facebook", sharedWith: ["instagram"], canRedraw: false }))).toContain("Same picture as Instagram.");
    expect(tile(poster({ network: "facebook", sharedWith: ["instagram"], canRedraw: false }))).not.toContain("Draw another for a different one");
    expect(tile(poster({ network: "facebook" }))).not.toContain("Same picture");
    expect(tile(poster({ network: "facebook", sharedWith: [], canRedraw: true }))).not.toContain("Same picture");
    expect(tile(poster({ network: "facebook", sharedWith: ["instagram"], status: "rejected", canRedraw: true }))).not.toContain("Same picture");
  });

  it("keeps the shape of the picture, wide for LinkedIn", () => {
    expect(tile(poster({ network: "linkedin", width: 1200, height: 628 }))).toContain("1200 / 628");
  });

  it("offers to change the words of a picture that is waiting or approved, but not one that did not pass or was put away", () => {
    expect(tile(poster({}))).toContain("Change the words");
    expect(tile(poster({ status: "approved" }))).toContain("Change the words");
    expect(tile(poster({ status: "blocked" }))).not.toContain("Change the words");
    expect(tile(poster({ status: "rejected", canRedraw: true, redrawsLeft: 1 }))).not.toContain("Change the words");
  });

  it("cannot approve a picture that did not pass the checks, shows why, and asks to confirm again for a held one", () => {
    const blocked = tile(poster({ status: "blocked", notice: "The logo could not be placed." }));
    expect(blocked).toContain("Did not pass our checks");
    expect(blocked).toContain("The logo could not be placed.");
    expect(blocked).not.toMatch(/>Approve</);
    expect(blocked).not.toContain("Send it back");
    expect(blocked).toContain("Put it away");
    expect(blocked).not.toContain("Draw another");
    const redraw = tile(poster({ status: "blocked", canRedraw: true, redrawsLeft: 1 }));
    expect(redraw).toContain("Draw another");
    expect(redraw).toContain("Put it away");
    expect(tile(poster({ status: "held" }))).toContain("Confirm again");
  });

  it("shows a picture the customer put away with only the choice to draw another", () => {
    const html = tile(poster({ status: "rejected", canRedraw: true, redrawsLeft: 1 }));
    expect(html).toContain("Put away");
    expect(html).toContain("Draw another");
    expect(html).not.toMatch(/>Approve</);
    expect(html).not.toContain("Send it back");
  });

  it("lets an approval be taken back", () => {
    expect(tile(poster({ status: "approved" }))).toContain("Take back my approval");
  });
});

describe("the review page when the posting service cannot be reached", () => {
  const empty = { jobs: [], batches: [], waiting: [], approved: [], expired: { batches: [], pictures: [] }, missingNetworks: [], reasons: [], unavailable: true };

  it("says so once and does not also claim that nothing is waiting", () => {
    const html = render(createElement(ReviewView, { review: empty }));
    expect(html).toContain("We could not reach the posting service just now");
    expect(html).not.toContain("No posts are waiting for you.");
    expect(html).not.toContain("No pictures are waiting for you.");
  });

  it("still says nothing is waiting when the service answered and there is nothing", () => {
    expect(render(createElement(ReviewView, { review: { ...empty, unavailable: false } }))).toContain("No posts are waiting for you.");
  });

  it("tells the customer what was put away because nobody decided in time, and lets an expired picture be drawn again", () => {
    const review = { ...empty, unavailable: false, expired: { batches: [{ id: "week-00.json", expiredAt: "2026-11-19T09:00:00.000Z" }], pictures: [poster({ status: "expired", canRedraw: true, redrawsLeft: 1 })] }, waiting: [poster({ status: "expired", canRedraw: true, redrawsLeft: 1 })] };
    const html = render(createElement(ReviewView, { review }));
    expect(html).toContain("put away because nobody decided within 14 days");
    expect(html).toContain("A batch of your written posts was closed on 19 November before you chose.");
    expect(html).toContain("can be drawn again below");
    expect(html).toContain("Put away: nobody decided in time");
    expect(html).toContain("View picture");
    expect(html).not.toMatch(/>Approve</);
    noDash(html);
  });

  it("shows no notice when nothing expired", () => {
    expect(render(createElement(ReviewView, { review: { ...empty, unavailable: false } }))).not.toContain("nobody decided");
  });
});

describe("more networks", () => {
  const empty = { jobs: [], batches: [], waiting: [], approved: [], expired: { batches: [], pictures: [] }, reasons: [], unavailable: false };

  it("offers to write the same posts for a network connected later, and says nothing when none is missing", () => {
    const html = render(createElement(ReviewView, { review: { ...empty, missingNetworks: ["facebook", "google"] } }));
    expect(html).toContain("More networks");
    expect(html).toContain("Write for Facebook");
    expect(html).toContain("Write for Google Business");
    expect(html).toContain("Nothing goes out until you approve it.");
    expect(html.match(/More networks/g)).toHaveLength(1);
    noDash(html);
    expect(render(createElement(ReviewView, { review: { ...empty, missingNetworks: [] } }))).not.toContain("More networks");
  });

  it("turns the buttons off and says it is writing while a job for a new network runs", () => {
    const job = { id: "j", kind: "network" as const, state: "running" as const, createdAt: "2026-11-11T10:00:00Z" };
    const html = render(createElement(ReviewView, { review: { ...empty, jobs: [job], missingNetworks: ["facebook"] } }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Writing</);
    expect(html).toContain("Writing your posts for the new network");
  });
});
