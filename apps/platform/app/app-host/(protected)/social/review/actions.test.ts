import { listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBillingAccess } from "@/lib/server/billing";
import { addNetwork, decideBatch, decideCarousel, decidePoster, drawBatch, loadTopics, makeCarousel, setCarouselWeekly, SocialAutoError, socialAutoSettings } from "@/lib/server/social-auto";
import { addNetworkAction, decideBatchAction, decideCarouselAction, decidePosterAction, drawBatchAction, makeCarouselAction, setWeeklyCarouselAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/billing", () => ({ requireBillingAccess: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), listBoughtSetupServices: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("@/lib/server/social-auto", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/social-auto")>()), socialAutoSettings: vi.fn(), decideBatch: vi.fn(), drawBatch: vi.fn(), decidePoster: vi.fn(), decideCarousel: vi.fn(), makeCarousel: vi.fn(), setCarouselWeekly: vi.fn(), addNetwork: vi.fn(), loadTopics: vi.fn() }));
vi.mock("@/lib/server/social-brand", () => ({ socialBrand: async (tenant: { businessId: string; businessName: string }) => ({ externalId: tenant.businessId, name: tenant.businessName, view: null }) }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Om Sweets", role: "owner" };
const ACTOR = "brandbasket:user-1";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireBillingAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ kind: "tx" } as never));
  vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"] as never);
  vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
  vi.mocked(decideBatch).mockResolvedValue({ id: "week-05", createdAt: "x", networks: [], posts: [], rules: {}, weeks: null });
  vi.mocked(drawBatch).mockResolvedValue({ job: { id: "j", kind: "draw", state: "queued", createdAt: "x" }, created: true });
  vi.mocked(decidePoster).mockResolvedValue({ job: null, waitingForRelease: false, postStopped: false });
});

describe("every action of the review page", () => {
  it.each([
    ["decideBatchAction", () => decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "keep" }))],
    ["drawBatchAction", () => drawBatchAction(form({ batchId: "week-05" }))],
    ["decidePosterAction", () => decidePosterAction(form({ action: "approve", id: "v1" }))],
    ["makeCarouselAction", () => makeCarouselAction()],
    ["setWeeklyCarouselAction", () => setWeeklyCarouselAction(form({ enabled: "on" }))],
    ["decideCarouselAction", () => decideCarouselAction(form({ id: "c1", action: "approve" }))],
  ])("%s is not found without the social service, and calls nothing", async (_name, act) => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue([] as never);
    await expect(act()).rejects.toThrow("notFound");
    for (const call of [decideBatch, drawBatch, decidePoster, makeCarousel, setCarouselWeekly, decideCarousel]) expect(call).not.toHaveBeenCalled();
  });
});

describe("decideBatchAction", () => {
  it("keeps, drops, and changes one network's words", async () => {
    await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "keep" }));
    expect(decideBatch).toHaveBeenLastCalledWith(expect.anything(), "business-1", "week-05", { action: "keep", postId: "p1" }, ACTOR);
    expect(revalidatePath).toHaveBeenCalledWith("/social/review");
    await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "drop" }));
    expect(decideBatch).toHaveBeenLastCalledWith(expect.anything(), "business-1", "week-05", { action: "drop", postId: "p1" }, ACTOR);
    await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit", network: "linkedin", caption: " New words " }));
    expect(decideBatch).toHaveBeenLastCalledWith(expect.anything(), "business-1", "week-05", { action: "edit", postId: "p1", caption: "New words", network: "linkedin" }, ACTOR);
  });

  it("refuses empty words and an unknown network before calling social-auto", async () => {
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit", caption: "   " }))).toEqual({ status: "error", message: "Write what the post should say." });
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit", caption: "x", network: "myspace" }))).toMatchObject({ status: "error" });
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "close" }))).toMatchObject({ status: "error" });
    expect(decideBatch).not.toHaveBeenCalled();
  });

  it("explains a final batch and words that do not agree with the website", async () => {
    vi.mocked(decideBatch).mockRejectedValue(new SocialAutoError("refused", 409, "locked", "BATCH_LOCKED"));
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "keep" }))).toMatchObject({ message: expect.stringMatching(/final/) });
    vi.mocked(decideBatch).mockRejectedValue(new SocialAutoError("refused", 422, "words", "WORDS_NOT_ACCEPTED"));
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit", caption: "x" }))).toMatchObject({ message: expect.stringMatching(/agree with what is on your website/) });
  });
});

describe("drawBatchAction", () => {
  it("asks for the pictures, and says in plain words when the limit is reached or nothing was kept", async () => {
    expect(await drawBatchAction(form({ batchId: "week-05" }))).toEqual({ status: "saved" });
    expect(drawBatch).toHaveBeenCalledWith(expect.anything(), "business-1", "week-05", ACTOR, undefined, false);
    vi.mocked(drawBatch).mockRejectedValue(new SocialAutoError("refused", 429, "limit", "DRAW_LIMIT_REACHED"));
    expect(await drawBatchAction(form({ batchId: "week-05" }))).toMatchObject({ message: expect.stringMatching(/tomorrow/) });
    vi.mocked(drawBatch).mockRejectedValue(new SocialAutoError("refused", 422, "none", "NOTHING_KEPT"));
    expect(await drawBatchAction(form({ batchId: "week-05" }))).toMatchObject({ message: expect.stringMatching(/Keep at least one post/) });
  });
});

describe("drawBatchAction, one week of a plan", () => {
  it("passes the week's Monday and the retry flag on, and refuses a week that is not a date", async () => {
    expect(await drawBatchAction(form({ batchId: "week-05", week: "2026-11-23" }))).toEqual({ status: "saved" });
    expect(drawBatch).toHaveBeenLastCalledWith(expect.anything(), "business-1", "week-05", ACTOR, "2026-11-23", false);
    await drawBatchAction(form({ batchId: "week-05", week: "2026-11-23", retry: "1" }));
    expect(drawBatch).toHaveBeenLastCalledWith(expect.anything(), "business-1", "week-05", ACTOR, "2026-11-23", true);
    vi.mocked(drawBatch).mockClear();
    expect(await drawBatchAction(form({ batchId: "week-05", week: "next monday" }))).toMatchObject({ status: "error" });
    expect(await drawBatchAction(form({ batchId: "week-05", retry: "yes" }))).toMatchObject({ status: "error" });
    expect(drawBatch).not.toHaveBeenCalled();
  });

  it("shows the posting service's own sentence when a channel has no pictures left this week", async () => {
    vi.mocked(drawBatch).mockRejectedValue(new SocialAutoError("refused", 429, "Instagram has no pictures left this week. They start again on Monday 16 November.", "PICTURE_LIMIT_REACHED"));
    expect(await drawBatchAction(form({ batchId: "week-05", week: "2026-11-09" }))).toEqual({ status: "error", message: "Instagram has no pictures left this week. They start again on Monday 16 November." });
  });
});

describe("decideBatchAction, the headline alone", () => {
  it("changes only the headline, and refuses an empty or over-long one", async () => {
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit-headline", headline: "  Order by Friday  " }))).toEqual({ status: "saved" });
    expect(decideBatch).toHaveBeenCalledWith(expect.anything(), "business-1", "week-05", { action: "edit", postId: "p1", headline: "Order by Friday" }, ACTOR);
    vi.mocked(decideBatch).mockClear();
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit-headline", headline: "   " }))).toEqual({ status: "error", message: "Write a headline." });
    expect(await decideBatchAction(form({ batchId: "week-05", postId: "p1", action: "edit-headline", headline: "x".repeat(121) }))).toEqual({ status: "error", message: "Keep the headline under 120 characters." });
    expect(decideBatch).not.toHaveBeenCalled();
  });
});

describe("the carousel of the week", () => {
  it("asks for this week's carousel as the signed-in person, for the business in the session", async () => {
    expect(await makeCarouselAction()).toEqual({ status: "saved" });
    expect(makeCarousel).toHaveBeenCalledWith(expect.anything(), "business-1", {}, ACTOR);
    expect(revalidatePath).toHaveBeenCalledWith("/social/review");
  });

  it("shows the posting service's sentence when this week's carousel was already made, and words for any other code", async () => {
    vi.mocked(makeCarousel).mockRejectedValue(new SocialAutoError("refused", 429, "You have made this week's carousel. You can make another from Monday 23 November.", "CAROUSEL_LIMIT_REACHED"));
    expect(await makeCarouselAction()).toEqual({ status: "error", message: "You have made this week's carousel. You can make another from Monday 23 November." });
    vi.mocked(makeCarousel).mockRejectedValue(new SocialAutoError("refused", 409, "x", "CONFLICT"));
    expect(await makeCarouselAction()).toEqual({ status: "error", message: "Start from your website first. The carousel is made from what it says." });
    vi.mocked(makeCarousel).mockRejectedValue(new Error("down"));
    expect(await makeCarouselAction()).toMatchObject({ status: "error" });
  });

  it("switches the weekly carousel on or off, and refuses any other value", async () => {
    await setWeeklyCarouselAction(form({ enabled: "on" }));
    expect(setCarouselWeekly).toHaveBeenLastCalledWith(expect.anything(), "business-1", true, ACTOR);
    await setWeeklyCarouselAction(form({ enabled: "off" }));
    expect(setCarouselWeekly).toHaveBeenLastCalledWith(expect.anything(), "business-1", false, ACTOR);
    vi.mocked(setCarouselWeekly).mockClear();
    expect(await setWeeklyCarouselAction(form({ enabled: "maybe" }))).toMatchObject({ status: "error" });
    expect(setCarouselWeekly).not.toHaveBeenCalled();
  });

  it("approves the whole carousel and says when it goes out, or sends it back with a reason and a comment", async () => {
    expect(await decideCarouselAction(form({ id: "c1", action: "approve" }))).toEqual({ status: "partial", message: "Approved. It goes out on its day." });
    expect(decideCarousel).toHaveBeenLastCalledWith(expect.anything(), "business-1", { action: "approve", id: "c1" }, ACTOR);
    expect(await decideCarouselAction(form({ id: "c1", action: "reject", reason: "weak_copy", comment: " Too plain " }))).toEqual({ status: "saved" });
    expect(decideCarousel).toHaveBeenLastCalledWith(expect.anything(), "business-1", { action: "reject", id: "c1", reason: "weak_copy", comment: "Too plain" }, ACTOR);
  });

  it("refuses a decision it cannot read: no reason, a bad id, an unknown action", async () => {
    for (const fields of [{ id: "c1", action: "reject" }, { id: "../c1", action: "approve" }, { id: "c1", action: "delete" }, { action: "approve" }] as Record<string, string>[]) {
      expect(await decideCarouselAction(form(fields))).toMatchObject({ status: "error" });
    }
    expect(decideCarousel).not.toHaveBeenCalled();
  });
});

describe("decidePosterAction", () => {
  it("approves, takes back, asks for another, sends back with a reason and approves a whole post", async () => {
    for (const action of ["approve", "withdraw", "redraw"]) {
      await decidePosterAction(form({ action, id: "v1" }));
      expect(decidePoster).toHaveBeenLastCalledWith(expect.anything(), "business-1", { action, id: "v1" }, ACTOR);
    }
    await decidePosterAction(form({ action: "reject", id: "v1", reason: "weak_copy", comment: "too long" }));
    expect(decidePoster).toHaveBeenLastCalledWith(expect.anything(), "business-1", { action: "reject", id: "v1", reason: "weak_copy", comment: "too long" }, ACTOR);
    await decidePosterAction(form({ action: "approve-topic", batchId: "week-05", postId: "p1" }));
    expect(decidePoster).toHaveBeenLastCalledWith(expect.anything(), "business-1", { action: "approve-topic", batchId: "week-05", postId: "p1" }, ACTOR);
  });

  it("changes one network's words and says what happens next, and says when an approval waits for the next update", async () => {
    vi.mocked(decidePoster).mockResolvedValue({ job: null, waitingForRelease: false, postStopped: true });
    expect(await decidePosterAction(form({ action: "change-words", id: "v1", caption: "New words." }))).toEqual({ status: "partial", message: expect.stringContaining("held back until you approve") });
    expect(decidePoster).toHaveBeenLastCalledWith(expect.anything(), "business-1", { action: "change-words", id: "v1", caption: "New words." }, ACTOR);
    vi.mocked(decidePoster).mockResolvedValue({ job: null, waitingForRelease: true, postStopped: false });
    expect(await decidePosterAction(form({ action: "approve", id: "v1" }))).toEqual({ status: "partial", message: expect.stringContaining("after the next update") });
    expect(await decidePosterAction(form({ action: "change-words", id: "v1", caption: "  " }))).toMatchObject({ status: "error" });
    vi.mocked(decidePoster).mockRejectedValue(new SocialAutoError("refused", 422, "x", "WORDS_NOT_ACCEPTED"));
    expect(await decidePosterAction(form({ action: "change-words", id: "v1", caption: "Number one in India" }))).toMatchObject({ message: expect.stringMatching(/website/) });
  });

  it("refuses a decision it cannot read, and explains a picture that was replaced or did not pass", async () => {
    expect(await decidePosterAction(form({ action: "reject", id: "v1" }))).toMatchObject({ status: "error" });
    expect(await decidePosterAction(form({ action: "delete", id: "v1" }))).toMatchObject({ status: "error" });
    expect(decidePoster).not.toHaveBeenCalled();
    vi.mocked(decidePoster).mockRejectedValue(new SocialAutoError("refused", 409, "x", "POSTER_SUPERSEDED"));
    expect(await decidePosterAction(form({ action: "approve", id: "v1" }))).toMatchObject({ message: expect.stringMatching(/newer picture/) });
    vi.mocked(decidePoster).mockRejectedValue(new SocialAutoError("refused", 409, "x", "POSTER_BLOCKED"));
    expect(await decidePosterAction(form({ action: "approve", id: "v1" }))).toMatchObject({ message: expect.stringMatching(/did not pass our checks/) });
  });
});

describe("addNetworkAction", () => {
  const topic = (batchId: string, postId: string, missing: string[]): never => ({ batchId, postId, headline: "H", networks: [], missing }) as never;

  it("asks once for every batch that lacks the network, and says the words will appear to approve", async () => {
    vi.mocked(loadTopics).mockResolvedValue([topic("week-01.json", "p1", ["facebook"]), topic("week-01.json", "p2", ["facebook", "google"]), topic("week-02.json", "p3", ["facebook"]), topic("week-03.json", "p4", ["google"])]);
    vi.mocked(addNetwork).mockResolvedValue({ id: "j", kind: "network", state: "queued", createdAt: "x" });
    expect(await addNetworkAction(form({ network: "facebook" }))).toEqual({ status: "partial", message: expect.stringContaining("writing your posts for Facebook") });
    expect(addNetwork).toHaveBeenCalledTimes(2);
    expect(addNetwork).toHaveBeenCalledWith(expect.anything(), "business-1", "week-01.json", "facebook", ACTOR);
    expect(addNetwork).toHaveBeenCalledWith(expect.anything(), "business-1", "week-02.json", "facebook", ACTOR);
  });

  it("says so when nothing lacks it, treats a batch that already has it as done, and explains a network with no account", async () => {
    vi.mocked(loadTopics).mockResolvedValue([]);
    expect(await addNetworkAction(form({ network: "facebook" }))).toEqual({ status: "partial", message: "Your posts are already written for Facebook." });
    expect(addNetwork).not.toHaveBeenCalled();
    vi.mocked(loadTopics).mockResolvedValue([topic("week-01.json", "p1", ["facebook"])]);
    vi.mocked(addNetwork).mockRejectedValue(new SocialAutoError("x", 409, "x", "NETWORK_ALREADY_THERE"));
    expect(await addNetworkAction(form({ network: "facebook" }))).toMatchObject({ status: "partial" });
    vi.mocked(addNetwork).mockRejectedValue(new SocialAutoError("x", 400, "x", "CHANNEL_NOT_CONNECTED"));
    expect(await addNetworkAction(form({ network: "facebook" }))).toEqual({ status: "error", message: expect.stringContaining("Connect an account") });
  });

  it("refuses a network it does not know", async () => {
    expect(await addNetworkAction(form({ network: "tiktok" }))).toMatchObject({ status: "error" });
    expect(loadTopics).not.toHaveBeenCalled();
  });
});
