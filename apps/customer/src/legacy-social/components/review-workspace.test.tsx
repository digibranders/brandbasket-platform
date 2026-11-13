import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Poster, TopicRequest, WrittenBatch, WrittenPost } from "@/legacy-social/lib/social/ai";
import type { ReviewGroup } from "@/legacy-social/lib/social/review-cards";
import { askTopicAction, decideBatchAction, decidePosterAction, drawBatchAction, moveTopicAction, replaceTopicAction } from "@/legacy-social/review-actions";
import { ReviewChannelsColumn, ReviewFlowProvider, ReviewWorkspace, type OwnTopicsData } from "./review-workspace";

vi.mock("@/legacy-social/actions", () => ({ connectChannelAction: vi.fn(async () => undefined) }));
vi.mock("@/legacy-social/review-actions", () => ({
  decideBatchAction: vi.fn(async () => ({ status: "saved" })),
  decidePosterAction: vi.fn(async () => ({ status: "saved" })),
  drawBatchAction: vi.fn(async () => ({ status: "saved" })),
  replaceTopicAction: vi.fn(async () => ({ status: "saved" })),
  moveTopicAction: vi.fn(async () => ({ status: "saved" })),
  askTopicAction: vi.fn(async () => ({ status: "saved" })),
}));

const post = (id: string, state: WrittenPost["state"], date: string, extra: Partial<WrittenPost> = {}): WrittenPost => ({ id, headline: `Headline ${id}`, caption: "Words", captions: { instagram: "IG words", facebook: "FB words" }, state, edited: false, advice: null, date, notDrawn: null, ...extra });
const poster = (id: string, postId: string, network: Poster["network"], status: Poster["status"]): Poster => ({ id, batchId: "b1", postId, network, shape: "square", width: 1080, height: 1080, headline: `Headline ${postId}`, caption: `${network} caption`, versionNumber: 1, status, canRedraw: true, redrawsLeft: 2, createdAt: "2026-11-13T10:00:00Z" });
const channels = [
  { platform: "instagram", account: "acme_foods" },
  { platform: "facebook", account: "Acme Page" },
] as const;

/** The channels column and the workspace beside it, as the review page lays them out. */
function Screen({ groups, channels: rows = channels, replacing, today, own }: { readonly own?: OwnTopicsData; readonly groups: ReviewGroup[]; readonly today?: string; readonly replacing?: Record<string, "writing" | "failed">; readonly channels?: ReadonlyArray<{ readonly platform: "instagram" | "facebook" | "linkedin" | "google"; readonly account: string }> }) {
  return (
    <ReviewFlowProvider groups={groups} reasons={[]} channels={rows} {...(replacing === undefined ? {} : { replacing })} {...(today === undefined ? {} : { today })} {...(own === undefined ? {} : { own })}>
      <ReviewChannelsColumn />
      <ReviewWorkspace />
    </ReviewFlowProvider>
  );
}

function open(posts: WrittenPost[], pictures: Poster[], weekState: "waiting" | "drawn", replacementsLeft?: number): ReviewGroup[] {
  const batch: WrittenBatch = { id: "b1", createdAt: "2026-11-13T10:00:00Z", networks: ["instagram", "facebook"], posts, rules: {}, weeks: [{ from: "2026-11-16", to: "2026-11-22", state: weekState, postIds: posts.map((one) => one.id), notDrawn: [], missingDays: [], ...(replacementsLeft === undefined ? {} : { replacementsLeft }) }] };
  return [{ batchId: "b1", batch, cards: posts.map((one) => ({ key: `b1/${one.id}`, batchId: "b1", postId: one.id, headline: one.headline, written: one, pictures: pictures.filter((pic) => pic.postId === one.id), states: [] })) }];
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewWorkspace topics", () => {
  const groups = open([post("p1", "pending", "2026-11-16"), post("p2", "kept", "2026-11-17")], [], "waiting");

  it("lists the channels and the topics as headlines with their day and time", () => {
    render(<Screen groups={groups} />);
    expect(screen.getByText("acme_foods")).toBeTruthy();
    expect(screen.getByText("Acme Page")).toBeTruthy();
    expect(screen.getByText("Headline p1")).toBeTruthy();
    // The topics sit in the columns of their days, with the time on the card.
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByText("Tue")).toBeTruthy();
    // The time sits by the date in the column header, only on days that have a post, and not on the card.
    expect(screen.getByText(/16 Nov 10:00 IST/)).toBeTruthy();
    expect(screen.getByText(/17 Nov 10:00 IST/)).toBeTruthy();
    expect(screen.queryByText("Not decided")).toBeNull();
    expect(screen.queryByText("Kept")).toBeNull();
    expect(screen.getAllByText("No post this day").length).toBe(3);
    expect(screen.getAllByText("Weekend, no post").length).toBe(2);
  });

  it("keeps and drops a topic with its icons", async () => {
    render(<Screen groups={groups} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Keep this topic" })[0] as HTMLElement);
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("batchId"), form.get("postId"), form.get("action")]).toEqual(["b1", "p1", "keep"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Drop this topic" })[0] as HTMLElement);
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(2));
    expect((vi.mocked(decideBatchAction).mock.calls[1]?.[0] as FormData).get("action")).toBe("drop");
  });

  it("changes a headline", async () => {
    render(<Screen groups={groups} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Change the headline" })[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText(/Headline \(it is printed/), { target: { value: "A better headline" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("action"), form.get("headline")]).toEqual(["edit-headline", "A better headline"]);
  });

  it("says what drawing locks before it draws, and draws the week once confirmed", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    render(<Screen groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw pictures for 1 kept" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/It locks only this topic/)).toBeTruthy();
    expect(vi.mocked(drawBatchAction)).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Draw pictures" }));
    await waitFor(() => expect(vi.mocked(drawBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(drawBatchAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("batchId"), form.get("week")]).toEqual(["b1", "2026-11-16"]);
  });
});

const request = (over: Partial<TopicRequest> = {}): TopicRequest => ({ id: "t-1", week: { from: "2026-11-16", to: "2026-11-22" }, goesOutOn: "2026-11-16", goesOutAt: "10:00", state: "writing", reason: null, createdAt: "2026-11-13T10:00:00Z", batchId: null, postId: null, picturesToDraw: 0, ...over });
const ownBatch = (state: WrittenPost["state"] = "pending"): WrittenBatch => ({ id: "own-1", createdAt: "2026-11-13T10:00:00Z", networks: ["instagram", "facebook"], posts: [post("o1", state, "2026-11-16", { headline: "Diwali thali special", captions: { instagram: "20% off all thalis until 2 Nov.", facebook: "20% off all thalis until 2 Nov, Facebook." } })], rules: {}, weeks: null });
const weekGroups = () => open([post("p1", "pending", "2026-11-16")], [], "waiting");
const ownData = (requests: TopicRequest[], batches: WrittenBatch[] = [], posters: Poster[] = [], canChange = true): OwnTopicsData => ({ requests, batches, posters, canChange });

describe("ReviewWorkspace her own topic of the week", () => {
  it("offers to write one for the week when she has none, and sends her words with the week", async () => {
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([])} />);
    expect(screen.getByText(/One a week\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write your own for this week." }));
    const box = screen.getByRole("textbox", { name: "Your topic" });
    const send = screen.getByRole("button", { name: "Write my post" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Diwali special: 20% off all thalis until 2 Nov." } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(vi.mocked(askTopicAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(askTopicAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("text"), form.get("week")]).toEqual(["Diwali special: 20% off all thalis until 2 Nov.", "2026-11-16"]);
  });

  it("shows the posting service's words when it refuses them", async () => {
    vi.mocked(askTopicAction).mockResolvedValueOnce({ status: "error", message: "Links are not read in this box. Write the details in words." });
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([])} />);
    fireEvent.click(screen.getByRole("button", { name: "Write your own for this week." }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your topic" }), { target: { value: "See www.example.com for the menu" } });
    fireEvent.click(screen.getByRole("button", { name: "Write my post" }));
    expect(await screen.findByText(/Links are not read in this box/)).toBeTruthy();
  });

  it("offers nothing to a viewer, for a week that has passed, or when she already wrote one", () => {
    const { unmount } = render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([], [], [], false)} />);
    expect(screen.queryByRole("button", { name: "Write your own for this week." })).toBeNull();
    unmount();
    const passed = render(<Screen groups={weekGroups()} today="2026-11-22" own={ownData([])} />);
    expect(screen.queryByRole("button", { name: "Write your own for this week." })).toBeNull();
    passed.unmount();
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request()])} />);
    expect(screen.queryByRole("button", { name: "Write your own for this week." })).toBeNull();
    expect(screen.getByText(/Writing your post from your words/)).toBeTruthy();
  });

  it("shows the written words to read, and keeps and draws the post in one go", async () => {
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request({ state: "waiting_for_words", batchId: "own-1", postId: "o1", picturesToDraw: 2 })], [ownBatch()])} />);
    expect(screen.getByText("Diwali thali special")).toBeTruthy();
    expect(screen.getByText("20% off all thalis until 2 Nov.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep and draw 2 pictures" }));
    await waitFor(() => expect(vi.mocked(drawBatchAction)).toHaveBeenCalledTimes(1));
    const keep = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect([keep.get("batchId"), keep.get("postId"), keep.get("action")]).toEqual(["own-1", "o1", "keep"]);
    expect((vi.mocked(drawBatchAction).mock.calls[0]?.[0] as FormData).get("batchId")).toBe("own-1");
  });

  it("does not ask to keep again a post that is kept, and stops at a refusal", async () => {
    vi.mocked(drawBatchAction).mockResolvedValueOnce({ status: "error", message: "You have used this week's pictures for one of your networks." });
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request({ state: "waiting_for_words", batchId: "own-1", postId: "o1", picturesToDraw: 2 })], [ownBatch("kept")])} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep and draw 2 pictures" }));
    expect(await screen.findByText(/used this week's pictures/)).toBeTruthy();
    expect(vi.mocked(decideBatchAction)).not.toHaveBeenCalled();
  });

  it("changes the headline of the written post", async () => {
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request({ state: "waiting_for_words", batchId: "own-1", postId: "o1", picturesToDraw: 2 })], [ownBatch()])} />);
    const card = within(screen.getByRole("region", { name: "Your own topic" }));
    fireEvent.click(card.getByRole("button", { name: "Change the headline" }));
    fireEvent.change(card.getByLabelText(/Headline \(it is printed/), { target: { value: "Thali week" } });
    fireEvent.click(card.getByRole("button", { name: "Save headline" }));
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("action"), form.get("headline"), form.get("batchId")]).toEqual(["edit-headline", "Thali week", "own-1"]);
  });

  it("shows the pictures once drawn, with their day, and says why a topic was not made", () => {
    const pic = { ...poster("op1", "o1", "instagram", "pending"), batchId: "own-1" };
    const drawn = render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request({ state: "drawn", batchId: "own-1", postId: "o1" })], [], [pic])} />);
    expect(screen.getByText("instagram caption", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("Mon 16 Nov").length).toBeGreaterThan(0);
    drawn.unmount();
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request({ state: "not_made", reason: "HEADLINE_TOO_WEAK" })])} />);
    expect(screen.getByText(/headline is too weak to draw/)).toBeTruthy();
  });
});

describe("ReviewWorkspace a week drawn in rounds", () => {
  /** p1 was drawn and is final; p2 is undecided and p3 kept but not drawn: both still open. */
  const partlyDrawn = (): ReviewGroup[] => {
    const posts = [post("p1", "kept", "2026-11-16", { drawn: true, locked: true }), post("p2", "pending", "2026-11-17", { drawn: false, locked: false }), post("p3", "kept", "2026-11-18", { drawn: false, locked: false })];
    const batch: WrittenBatch = { id: "b1", createdAt: "2026-11-13T10:00:00Z", networks: ["instagram", "facebook"], posts, rules: {}, weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "partly_drawn", postIds: ["p1", "p2", "p3"], openPostIds: ["p2", "p3"], notDrawn: [], missingDays: [] }] };
    return [{ batchId: "b1", batch, cards: posts.map((one) => ({ key: `b1/${one.id}`, batchId: "b1", postId: one.id, headline: one.headline, written: one, pictures: one.id === "p1" ? [poster("x1", "p1", "instagram", "pending")] : [], states: [] })) }];
  };

  it("keeps the open topics editable and locks only the one that was drawn", () => {
    render(<Screen groups={partlyDrawn()} today="2026-11-13" />);
    const grid = (name: string) => within(document.querySelector("[data-drop-day=\"2026-11-16\"]")?.parentElement as HTMLElement).getByText(name).closest("li") as HTMLElement;
    expect(within(grid("Headline p1")).queryByRole("button", { name: "Keep this topic" })).toBeNull();
    expect(within(grid("Headline p1")).getByText("Drawn. Its pictures are below.")).toBeTruthy();
    expect(within(grid("Headline p2")).getByRole("button", { name: "Keep this topic" })).toBeTruthy();
    expect(within(grid("Headline p3")).getByRole("button", { name: "Drop this topic" })).toBeTruthy();
  });

  it("says how many new pictures the next draw makes, and that the others stay open", async () => {
    render(<Screen groups={partlyDrawn()} today="2026-11-13" />);
    expect(screen.getByText(/1 kept to draw\./)).toBeTruthy();
    expect(screen.getByText(/Drawing makes 2 new pictures\. The other one stays open/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draw pictures for 1 kept" })).toBeTruthy();
  });

  it("keeps the pictures out of the Topics step, shows them under Pictures, and says what is left to do in the sidebar", () => {
    render(<Screen groups={partlyDrawn()} today="2026-11-13" />);
    expect(screen.queryByText(/instagram caption/)).toBeNull();
    expect(screen.getByText("1 to decide, 1 to approve")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pictures" }));
    expect(screen.getByText(/instagram caption/)).toBeTruthy();
    expect(screen.getByText("1 waiting · 0 approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Draw pictures for/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Topics" }));
    expect(screen.getByText("1 to decide, 1 to approve")).toBeTruthy();
  });

  it("does not count a kept topic whose day has passed among the new pictures", () => {
    render(<Screen groups={partlyDrawn()} today="2026-11-18" />);
    expect(screen.getByRole("button", { name: "Draw pictures for 0 kept" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("ReviewWorkspace topics left untouched when the week is drawn", () => {
  it("says which topics were not decided, so nothing was drawn for them and they are final", () => {
    const groups = open([post("p1", "kept", "2026-11-16"), post("p2", "pending", "2026-11-17"), post("p3", "dropped", "2026-11-18")], [poster("x1", "p1", "instagram", "approved")], "drawn");
    render(<Screen groups={groups} today="2026-11-13" />);
    expect(screen.getByText(/Not decided before the pictures were drawn.*Headline p2/)).toBeTruthy();
    expect(screen.getByText(/Dropped, nothing drawn: Headline p3/)).toBeTruthy();
  });
});

describe("ReviewWorkspace her own topic in the other steps", () => {
  it("is shown with the topics only: once the week is drawn her topic's pictures are listed with the others", () => {
    const own = ownData([request({ state: "drawn", batchId: "own-1", postId: "o1" })], [], [{ ...poster("op1", "o1", "instagram", "pending"), batchId: "own-1", caption: "own words for instagram" }]);
    const drawn = open([post("p1", "kept", "2026-11-16")], [poster("x1", "p1", "instagram", "pending")], "drawn");
    render(<Screen groups={drawn} today="2026-11-13" own={own} />);
    expect(screen.queryByRole("region", { name: "Your own topic" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Write your own for this week." })).toBeNull();
    expect(screen.getByText(/own words for instagram/)).toBeTruthy();
    expect(screen.getByText("2 waiting · 0 approved")).toBeTruthy();
  });
});

describe("ReviewWorkspace days and times from the posting service", () => {
  it("labels a picture with its own day and time, which is the new day of a post that was moved", () => {
    const moved = { ...poster("x1", "p1", "instagram", "pending"), date: "2026-11-24", time: "18:30" };
    const groups = open([post("p1", "kept", "2026-11-16")], [moved], "drawn");
    render(<Screen groups={groups} today="2026-11-15" />);
    expect(screen.getAllByText("Tue 24 Nov").length).toBeGreaterThan(0);
    expect(screen.getAllByText("18:30 IST").length).toBeGreaterThan(0);
    expect(screen.queryByText("Mon 16 Nov")).toBeNull();
  });

  it("shows the time a written post carries by its day, and 10:00 when it carries none", () => {
    const groups = open([post("p1", "pending", "2026-11-16", { time: "18:30" }), post("p2", "pending", "2026-11-17")], [], "waiting");
    render(<Screen groups={groups} />);
    expect(screen.getByText(/16 Nov 18:30 IST/)).toBeTruthy();
    expect(screen.getByText(/17 Nov 10:00 IST/)).toBeTruthy();
  });

  it("tells her to read the words again when a moved topic names a day", async () => {
    vi.mocked(moveTopicAction).mockResolvedValueOnce({ status: "partial", message: "Moved. The words of this topic name a day, so read them again to see they still fit." });
    render(<Screen groups={open([post("p1", "pending", "2026-11-16")], [], "waiting")} today="2026-11-15" />);
    fireEvent.click(screen.getByRole("button", { name: "Change the day" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Move this topic to" }), { target: { value: "2026-11-19" } });
    expect(await screen.findByText(/name a day/)).toBeTruthy();
  });
});

describe("ReviewWorkspace week navigation", () => {
  const twoWeeks = (): ReviewGroup[] => {
    const posts = [post("p1", "pending", "2026-11-16"), post("p2", "pending", "2026-11-23")];
    const batch: WrittenBatch = {
      id: "b1",
      createdAt: "2026-11-13T10:00:00Z",
      networks: ["instagram", "facebook"],
      posts,
      rules: {},
      weeks: [
        { from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: ["p1"], notDrawn: [], missingDays: [] },
        { from: "2026-11-23", to: "2026-11-29", state: "waiting", postIds: ["p2"], notDrawn: [], missingDays: [] },
      ],
    };
    return [{ batchId: "b1", batch, cards: posts.map((one) => ({ key: `b1/${one.id}`, batchId: "b1", postId: one.id, headline: one.headline, written: one, pictures: [], states: [] })) }];
  };

  it("shows one week at a time, says when it is this week or the next, and steps with the arrows", () => {
    render(<Screen groups={twoWeeks()} today="2026-11-18" />);
    expect(screen.getByText(/16 Nov to 22 Nov/)).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Headline p1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Earlier week" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(screen.getByText(/23 Nov to 29 Nov/)).toBeTruthy();
    expect(screen.getByText("Next week")).toBeTruthy();
    expect(screen.getByText("Headline p2")).toBeTruthy();
    expect(screen.queryByText("Headline p1")).toBeNull();
    expect((screen.getByRole("button", { name: "Later week" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    expect(screen.getByText("Headline p1")).toBeTruthy();
  });
});

describe("ReviewWorkspace moving a topic to another day", () => {
  const groups = open([post("p1", "pending", "2026-11-16"), post("p2", "kept", "2026-11-17")], [], "waiting");

  it("moves a topic with its day picker, only to a day of its week from tomorrow on", async () => {
    render(<Screen groups={groups} today="2026-11-16" />);
    // p1 is on Mon 16 Nov: it can go to Tue 17 and later, not back to a passed day.
    const pickers = screen.getAllByRole("button", { name: "Change the day" });
    expect(pickers.length).toBe(2);
    fireEvent.click(pickers[0] as HTMLElement);
    const select = screen.getByRole("combobox", { name: "Move this topic to" });
    const options = within(select).getAllByRole("option").map((one) => one.textContent);
    expect(options).toContain("Wed 18 Nov");
    expect(options).not.toContain("Mon 16 Nov");
    fireEvent.change(select, { target: { value: "2026-11-19" } });
    await waitFor(() => expect(vi.mocked(moveTopicAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(moveTopicAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("batchId"), form.get("postId"), form.get("day")]).toEqual(["b1", "p1", "2026-11-19"]);
  });

  it("moves a topic when its card is dragged to another day column", async () => {
    const spot = document.createElement("div");
    spot.setAttribute("data-drop-day", "2026-11-20");
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(spot);
    render(<Screen groups={groups} today="2026-11-15" />);
    const card = screen.getByText("Headline p1").closest("li") as HTMLElement;
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 40 });
    await waitFor(() => expect(vi.mocked(moveTopicAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(moveTopicAction).mock.calls[0]?.[0] as FormData).get("day")).toBe("2026-11-20");
    elementFromPoint.mockRestore();
  });

  it("does not move a topic dropped on a day that has passed, or put back with Escape", () => {
    const spot = document.createElement("div");
    spot.setAttribute("data-drop-day", "2026-11-16");
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(spot);
    render(<Screen groups={groups} today="2026-11-16" />);
    const card = screen.getByText("Headline p2").closest("li") as HTMLElement;
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 40 });
    expect(vi.mocked(moveTopicAction)).not.toHaveBeenCalled();
    spot.setAttribute("data-drop-day", "2026-11-21");
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 40 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 40 });
    expect(vi.mocked(moveTopicAction)).not.toHaveBeenCalled();
    elementFromPoint.mockRestore();
  });

  it("offers no move once the week is drawn", () => {
    const drawn = open([post("p1", "kept", "2026-11-16")], [poster("x1", "p1", "instagram", "pending")], "drawn");
    render(<Screen groups={drawn} today="2026-11-15" />);
    expect(screen.queryByRole("button", { name: "Change the day" })).toBeNull();
  });
});

describe("ReviewWorkspace topics without a day", () => {
  it("lists them one under the other, so none is hidden", () => {
    const groups = open([post("p1", "pending", "2026-11-16"), post("p2", "pending", "2026-11-17")], [], "waiting");
    const first = groups[0]?.cards[0]?.written;
    if (first !== undefined && first !== null) (first as { date: string | null }).date = null;
    render(<Screen groups={groups} />);
    expect(screen.getByText("Headline p1")).toBeTruthy();
    expect(screen.getByText("Headline p2")).toBeTruthy();
    expect(screen.queryByText("Weekend, no post")).toBeNull();
  });
});

describe("ReviewWorkspace new topics", () => {
  const dropped = (left: number, extra: Partial<WrittenPost> = {}) => open([post("p1", "dropped", "2026-11-16", extra), post("p2", "kept", "2026-11-17")], [], "waiting", left);

  it("offers a new topic for a dropped post, and asks for it", async () => {
    render(<Screen groups={dropped(2)} />);
    expect(screen.getByText("2 left this week.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write a new topic for this day" }));
    await waitFor(() => expect(vi.mocked(replaceTopicAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(replaceTopicAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("batchId"), form.get("postId")]).toEqual(["b1", "p1"]);
  });

  it("says one is being written, and does not offer another", () => {
    render(<Screen groups={dropped(2)} replacing={{ p1: "writing" }} />);
    expect(screen.getByText(/Writing a new topic for this day/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Write a new topic for this day" })).toBeNull();
  });

  it("says the last try wrote nothing, and lets her try again", () => {
    render(<Screen groups={dropped(2)} replacing={{ p1: "failed" }} />);
    expect(screen.getByText(/We could not write one this time/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Write a new topic for this day" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("turns the button off when none are left this week", () => {
    render(<Screen groups={dropped(0)} />);
    expect((screen.getByRole("button", { name: "Write a new topic for this day" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No new topics are left this week.")).toBeTruthy();
  });

  it("points to the new topic once there is one, and marks it", () => {
    const groups = open([post("p1", "dropped", "2026-11-16", { replacedBy: "p1-r1" }), post("p1-r1", "pending", "2026-11-16", { replaces: "p1" })], [], "waiting", 2);
    render(<Screen groups={groups} />);
    expect(screen.getByText(/A new topic was written for this day/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Write a new topic for this day" })).toBeNull();
  });
});

describe("ReviewWorkspace pictures", () => {
  const groups = open([post("p1", "kept", "2026-11-16"), post("p2", "kept", "2026-11-17")], [poster("x1", "p1", "instagram", "pending"), poster("x2", "p2", "instagram", "pending"), poster("y1", "p1", "facebook", "approved")], "drawn");

  it("shows each picture of the channel as it will look there, with its day", () => {
    render(<Screen groups={groups} />);
    expect(screen.getByText("2 waiting · 0 approved")).toBeTruthy();
    expect(screen.getAllByText("instagram caption", { exact: false }).length).toBe(2);
    expect(screen.getAllByText("Mon 16 Nov").length).toBeGreaterThan(0);
  });

  it("approves a picture, and all the waiting ones of the channel", async () => {
    render(<Screen groups={groups} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await waitFor(() => expect(vi.mocked(decidePosterAction)).toHaveBeenCalledTimes(1));
    expect([(vi.mocked(decidePosterAction).mock.calls[0]?.[0] as FormData).get("action"), (vi.mocked(decidePosterAction).mock.calls[0]?.[0] as FormData).get("id")]).toEqual(["approve", "x1"]);
    fireEvent.click(screen.getByRole("button", { name: "Approve all 2 for Instagram" }));
    await waitFor(() => expect(vi.mocked(decidePosterAction)).toHaveBeenCalledTimes(3));
  });

  it("switches channel and shows the table for all channels", () => {
    render(<Screen groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.getByText("0 waiting · 1 approved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /All channels/ }));
    expect(screen.getByRole("columnheader", { name: "Instagram" })).toBeTruthy();
  });

  it("offers to connect the networks that have no account yet, like the Posts page does", () => {
    render(<Screen groups={groups} />);
    expect(screen.getByRole("button", { name: /Connect LinkedIn/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect Google/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Connect Instagram/ })).toBeNull();
  });

  it("says when there is nothing to look over", () => {
    render(<Screen groups={[]} channels={[]} />);
    expect(screen.getByText("No posts are waiting for you.")).toBeTruthy();
  });
});
