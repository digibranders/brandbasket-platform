import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Poster, TopicRequest, WrittenBatch, WrittenPost } from "@/legacy-social/lib/social/ai";
import type { ReviewGroup } from "@/legacy-social/lib/social/review-cards";
import { askTopicAction, decideBatchAction, decidePosterAction, drawBatchAction, moveTopicAction, replaceTopicAction } from "@/legacy-social/review-actions";
import type { CarouselSummary } from "@/legacy-social/lib/social/carousel";
import type { WeekCarousel } from "./carousel-week";
import { ActiveJobNote, NewChannelChoice, ReviewChannelsColumn, ReviewFlowProvider, ReviewWorkspace, type OwnTopicsData } from "./review-workspace";

vi.mock("@/legacy-social/actions", () => ({ connectChannelAction: vi.fn(async () => undefined), }));
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

/** The week\'s carousel, written for Instagram only, dated on the Friday of the test week. */
const weekCarousel = (status: CarouselSummary["status"]): WeekCarousel => ({
  summary: { id: "c1", topic: "Diwali boxes", date: "2026-11-20", count: 3, status, headlines: ["One", "Two", "Three"] },
  detail: { id: "c1", count: 3, status, slides: [1, 2, 3].map((position) => ({ position, status })), captions: [{ network: "instagram", caption: "Fresh sweets.", status }], reasons: [] },
  canChange: true,
});

/** The channels column and the workspace beside it, as the review page lays them out. */
function Screen({ groups, channels: rows = channels, replacing, today, own, carousel }: { readonly carousel?: WeekCarousel; readonly own?: OwnTopicsData; readonly groups: ReviewGroup[]; readonly today?: string; readonly replacing?: Record<string, "writing" | "failed">; readonly channels?: ReadonlyArray<{ readonly platform: "instagram" | "facebook" | "linkedin" | "google"; readonly account: string }> }) {
  return (
    <ReviewFlowProvider groups={groups} reasons={[]} channels={rows} {...(replacing === undefined ? {} : { replacing })} {...(today === undefined ? {} : { today })} {...(own === undefined ? {} : { own })} {...(carousel === undefined ? {} : { carousel })}>
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

  it("takes a kept or dropped topic back to undecided with a second click on the same icon", async () => {
    render(<Screen groups={groups} />);
    // p2 is kept: its green check, pressed again, resets it.
    fireEvent.click(screen.getAllByRole("button", { name: "Keep this topic" })[1] as HTMLElement);
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("postId"), form.get("action")]).toEqual(["p2", "reset"]);
  });

  it("keeps and drops a topic with its icons", async () => {
    render(<Screen groups={groups} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Keep this topic" })[0] as HTMLElement);
    await waitFor(() => expect(vi.mocked(decideBatchAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideBatchAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("batchId"), form.get("postId"), form.get("action")]).toEqual(["b1", "p1", "keep"]);
    // A choice is ignored while the one before it is still on its way, so wait for the buttons to come back on before the next click.
    await waitFor(() => expect((screen.getAllByRole("button", { name: "Drop this topic" })[0] as HTMLButtonElement).disabled).toBe(false));
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
    expect(screen.getByRole("button", { name: "Write your prompt for this week." }).getAttribute("title")).toContain("One a week");
    fireEvent.click(screen.getByRole("button", { name: "Write your prompt for this week." }));
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
    fireEvent.click(screen.getByRole("button", { name: "Write your prompt for this week." }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your topic" }), { target: { value: "See www.example.com for the menu" } });
    fireEvent.click(screen.getByRole("button", { name: "Write my post" }));
    expect(await screen.findByText(/Links are not read in this box/)).toBeTruthy();
  });

  it("offers nothing to a viewer, for a week that has passed, or when she already wrote one", () => {
    const { unmount } = render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([], [], [], false)} />);
    expect(screen.queryByRole("button", { name: "Write your prompt for this week." })).toBeNull();
    unmount();
    const passed = render(<Screen groups={weekGroups()} today="2026-11-22" own={ownData([])} />);
    expect(screen.queryByRole("button", { name: "Write your prompt for this week." })).toBeNull();
    passed.unmount();
    render(<Screen groups={weekGroups()} today="2026-11-13" own={ownData([request()])} />);
    expect(screen.queryByRole("button", { name: "Write your prompt for this week." })).toBeNull();
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
    // Its picture is drawn: a small preview of it sits in the card, which opens the pictures.
    expect(within(grid("Headline p1")).getByRole("button", { name: "Open the picture: Headline p1" })).toBeTruthy();
    expect(within(grid("Headline p2")).getByRole("button", { name: "Keep this topic" })).toBeTruthy();
    expect(within(grid("Headline p3")).getByRole("button", { name: "Drop this topic" })).toBeTruthy();
  });

  it("says what to do on the Pictures step when no picture was drawn yet, and when none is waiting or approved", () => {
    const none = partlyDrawn().map((group) => ({ ...group, cards: group.cards.map((card) => ({ ...card, pictures: [], written: card.written === null ? null : { ...card.written, drawn: false, locked: false } })) }));
    const first = render(<Screen groups={none} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: /^Pictures/ }));
    expect(screen.getByText(/No pictures yet\. Keep the topics you like under Topics and press Draw pictures/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByText(/Nothing is approved yet/)).toBeTruthy();
    first.unmount();
    render(<Screen groups={partlyDrawn().map((group) => ({ ...group, cards: group.cards.map((card) => ({ ...card, pictures: card.pictures.map((one) => ({ ...one, status: "approved" as const })) })) }))} today="2026-11-13" />);
    fireEvent.click(screen.getByRole("button", { name: /^Pictures/ }));
    expect(screen.getByText(/Nothing is waiting for you to approve/)).toBeTruthy();
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
    expect(screen.getAllByLabelText("2 to do").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Pictures" }));
    expect(screen.getByText(/instagram caption/)).toBeTruthy();
    expect(screen.getByText("1 waiting · 0 approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Draw pictures for/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Topics" }));
    expect(screen.getAllByLabelText("2 to do").length).toBeGreaterThan(0);
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
    expect(screen.queryByRole("button", { name: "Write your prompt for this week." })).toBeNull();
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

  it("lists the carousel in the all-channels table, and says which channels it is not for", () => {
    render(<Screen groups={groups} carousel={weekCarousel("topic")} />);
    fireEvent.click(screen.getByRole("button", { name: /All channels/ }));
    expect(screen.getByText("Carousel: Diwali boxes")).toBeTruthy();
    expect(screen.getByText("Not decided")).toBeTruthy();
    expect(screen.getByText("Not for this channel")).toBeTruthy();
  });

  it("shows the carousel for a channel it was written for, and not for another", () => {
    render(<Screen groups={groups} carousel={weekCarousel("topic")} />);
    expect(screen.getByText("Carousel: Diwali boxes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.queryByText("Carousel: Diwali boxes")).toBeNull();
  });

  it("offers to connect the networks that have no account yet, like the Posts page does", () => {
    render(<Screen groups={groups} />);
    expect(screen.getByRole("button", { name: /Connect LinkedIn/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect Google/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Connect Instagram/ })).toBeNull();
  });

  it("shows nothing in the place of the week when there is nothing to look over", () => {
    render(<Screen groups={[]} channels={[]} />);
    expect(screen.queryByText("No posts are waiting for you.")).toBeNull();
  });
});

describe("ReviewWorkspace: channels with a batch of their own", () => {
  /** Instagram's batch (Mon and Sat) and Facebook's (Wed and Fri), written separately because the channels post on different days. */
  const batchFor = (id: string, network: "instagram" | "facebook", posts: WrittenPost[]): ReviewGroup => {
    const batch: WrittenBatch = { id, createdAt: "2026-11-13T10:00:00Z", networks: [network], posts, rules: {}, weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: posts.map((one) => one.id), notDrawn: [], missingDays: [], replacementsLeft: 3 }] } as unknown as WrittenBatch;
    return { batchId: id, batch, cards: posts.map((one) => ({ key: `${id}/${one.id}`, batchId: id, postId: one.id, headline: one.headline, written: one, pictures: [], states: [] })) };
  };
  const groups = [
    batchFor("bi", "instagram", [post("ig1", "pending", "2026-11-16"), post("ig2", "pending", "2026-11-21")]),
    batchFor("bf", "facebook", [post("fb1", "pending", "2026-11-18"), post("fb2", "pending", "2026-11-20")]),
  ];

  it("shows each channel only the topics written for it", () => {
    render(<Screen groups={groups} />);
    expect(screen.getByText("Headline ig1")).toBeTruthy();
    expect(screen.queryByText("Headline fb1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.getByText("Headline fb1")).toBeTruthy();
    expect(screen.getByText("Headline fb2")).toBeTruthy();
    expect(screen.queryByText("Headline ig1")).toBeNull();
  });

  it("counts what each channel has to decide in its own batch, and shows nothing for a channel with no batch", () => {
    render(<Screen groups={groups} channels={[...channels, { platform: "linkedin", account: "Acme Profile" }]} />);
    const row = (name: RegExp): HTMLElement => screen.getByRole("button", { name }).closest("li") as HTMLElement;
    expect(row(/acme_foods/).textContent).toContain("2");
    expect(row(/Acme Page/).textContent).toContain("2");
    expect(row(/Acme Profile/).textContent).not.toMatch(/\d to decide|\d to approve/);
    fireEvent.click(screen.getByRole("button", { name: /Acme Profile/ }));
    expect(screen.queryByText("Headline ig1")).toBeNull();
    expect(screen.queryByText("Headline fb1")).toBeNull();
  });
});

describe("ActiveJobNote", () => {
  const groups = open([post("p1", "pending", "2026-11-16")], [], "waiting");
  const screenWith = (networks: Parameters<typeof ActiveJobNote>[0]["networks"]) => (
    <ReviewFlowProvider groups={groups} reasons={[]} channels={channels}>
      <ReviewChannelsColumn />
      <ActiveJobNote text="We are writing your posts. This page updates when it is ready." networks={networks} />
    </ReviewFlowProvider>
  );

  it("speaks for the channels the batch is for, and tells another channel that nothing is being written for it", () => {
    render(screenWith(["instagram"]));
    expect(screen.getByText(/We are writing your posts/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.queryByText(/We are writing your posts/)).toBeNull();
    expect(screen.getByText(/Nothing is being written for Facebook yet/)).toBeTruthy();
  });

  it("is shown on every channel when the posting service does not say which the batch is for", () => {
    render(screenWith(undefined));
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.getByText(/We are writing your posts/)).toBeTruthy();
  });
});

describe("NewChannelChoice", () => {
  const groups = open([post("p1", "pending", "2026-11-16")], [], "waiting");
  const unwritten = { channels: ["facebook"] as const, startDate: "2026-11-16", writtenFor: ["instagram"] as const };
  const screenWith = (missing: readonly ("facebook")[]) => (
    <ReviewFlowProvider groups={groups} reasons={[]} channels={channels}>
      <ReviewChannelsColumn />
      <NewChannelChoice unwritten={unwritten} missing={missing} postingDays={{ facebook: ["wed", "fri"] }} website="acme.com" busy={false} canChange />
    </ReviewFlowProvider>
  );

  it("shows the two ways for the channel with no posts, and nothing for the channel that has them or in the all-channels view", () => {
    render(screenWith(["facebook"]));
    expect(screen.queryByRole("heading", { name: "Posts for Facebook" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /All channels/ }));
    expect(screen.queryByRole("heading", { name: "Posts for Facebook" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.getByRole("heading", { name: "Posts for Facebook" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Same topics as Instagram" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "New topics for Facebook" })).toBeTruthy();
    expect(screen.getByText("Facebook posts on Wed, Fri")).toBeTruthy();
  });

  it("asks once before copying the topics, and says why it cannot when the days differ", () => {
    render(screenWith(["facebook"]));
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use the same topics for Facebook" }));
    expect(screen.getByRole("button", { name: "Yes, write and draw" })).toBeTruthy();
    cleanup();
    render(screenWith([]));
    fireEvent.click(screen.getByRole("button", { name: /Acme Page/ }));
    expect(screen.getByText(/posts on other days than Instagram/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use the same topics for Facebook" })).toBeNull();
    expect(screen.getByRole("button", { name: "Write new topics for Facebook" })).toBeTruthy();
  });
});

describe("ReviewWorkspace: the numbers on the steps", () => {
  it("shows how many topics are left to decide, and none once they are all decided", () => {
    render(<Screen groups={open([post("p1", "pending", "2026-11-16"), post("p2", "pending", "2026-11-17"), post("p3", "kept", "2026-11-18")], [], "waiting")} />);
    expect(screen.getByTitle("2 topics to decide")).toBeTruthy();
    cleanup();
    render(<Screen groups={open([post("p1", "kept", "2026-11-16")], [], "waiting")} />);
    expect(screen.queryByTitle(/topics to decide/)).toBeNull();
  });

  it("shows how many pictures wait for approval, and no number on Approved", () => {
    const posts = [post("p1", "kept", "2026-11-16"), post("p2", "kept", "2026-11-17")];
    render(<Screen groups={open(posts, [poster("a", "p1", "instagram", "pending"), poster("b", "p2", "instagram", "approved")], "drawn")} />);
    expect(screen.getByTitle("1 pictures to approve")).toBeTruthy();
    expect(screen.queryByTitle(/approved/)).toBeNull();
  });
});

describe("ReviewWorkspace: going back to the topics of a drawn week", () => {
  it("lets her read the topics of a week whose pictures are drawn, and come back to the pictures", () => {
    const posts = [post("p1", "kept", "2026-11-16"), post("p2", "pending", "2026-11-17")];
    render(<Screen groups={open(posts, [poster("a", "p1", "instagram", "approved")], "drawn")} />);
    expect(screen.queryByText("Headline p2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Topics/ }));
    expect(screen.getByText("Headline p2")).toBeTruthy();
    expect(screen.getByText("Headline p1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Pictures/ }));
    expect(screen.queryByText("Headline p2")).toBeNull();
  });
});

describe("ReviewWorkspace: a small picture inside a drawn topic", () => {
  it("shows the drawn topic's picture small, and pressing it opens the pictures under Approved", () => {
    const posts = [post("p1", "kept", "2026-11-16", { drawn: true, locked: true }), post("p2", "pending", "2026-11-17")];
    render(<Screen groups={open(posts, [poster("a", "p1", "instagram", "approved")], "drawn")} />);
    // A drawn week opens on its pictures: go back to the topics to see the small picture.
    fireEvent.click(screen.getByRole("button", { name: /^Topics/ }));
    const thumb = screen.getByRole("button", { name: "Open the picture: Headline p1" });
    expect(thumb.querySelector("img")?.getAttribute("src")).toContain("id=a");
    fireEvent.click(thumb);
    expect(screen.queryByText("Headline p2")).toBeNull();
    expect(screen.getByRole("heading", { name: "Headline p1" })).toBeTruthy();
  });
});

