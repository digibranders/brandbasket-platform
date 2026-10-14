import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createListingAccountBusiness, decideDirectoryClaim } from "./queries/directory-ads";
import {
  completeDirectoryVideo,
  discardDirectoryVideo,
  findPendingDirectoryVideo,
  listDirectoryVideos,
  listDirectoryVideosForStaff,
  newDirectoryVideoId,
  readLiveDirectoryVideos,
  removeDirectoryVideo,
  setFeaturedDirectoryVideo,
  startDirectoryVideo,
  takeDownDirectoryVideo,
  type DirectoryVideo,
} from "./queries/directory-videos";
import { businesses, directoryVideos, users, type DirectoryVideoSlot } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "staff-1";
const OWNERS = ["owner-a", "owner-b"] as const;
const KEYS = ["dentists/thane/naupada/smile-dental", "dentists/thane/naupada/bright-teeth"] as const;
const NOON = new Date("2026-10-08T06:30:00.000Z");
const POSTER = "https://i.vimeocdn.com/video/2209820655-2632ea6a5f5d1b223f515fd27aaf9a-d_640x360";

let dbs: TestDatabases;
let business: string[] = [];
let claims: string[] = [];
let minutes = 0;
let vimeoCounter = 0;

function id(index: number): string {
  const value = business[index];
  if (value === undefined) throw new Error(`No business ${index}`);
  return value;
}

function asBusiness<T>(index: number, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  const owner = OWNERS[index];
  if (owner === undefined) throw new Error(`No owner ${index}`);
  return withTenantScope(dbs.app.db, { userId: owner, businessId: id(index) }, work);
}

/** A later moment each call, so "oldest first" and "newest first" have an order to show. */
function later(): Date {
  minutes += 1;
  return new Date(NOON.getTime() + minutes * 60_000);
}

/** Vimeo's own id for a new video: digits. */
function nextVimeoId(): string {
  vimeoCounter += 1;
  return String(1_233_986_000 + vimeoCounter);
}

/** The business becomes a Premium member: its row is a website client's, as activateFirstPayment leaves it. */
async function makeMember(index: number): Promise<void> {
  await dbs.staff.db.update(businesses).set({ kind: "website" }).where(eq(businesses.id, id(index)));
}

async function approveClaim(index: number): Promise<void> {
  const claimId = claims[index];
  if (claimId === undefined) throw new Error(`No claim ${index}`);
  await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: NOON });
}

/** The owner asks for an upload: the row exists, waiting for the file. */
async function start(
  index: number,
  slot: DirectoryVideoSlot,
  vimeoId = nextVimeoId(),
): Promise<{ readonly video: DirectoryVideo; readonly stale: readonly string[] }> {
  const outcome = await startDirectoryVideo(dbs.staff.db, {
    id: newDirectoryVideoId(),
    businessId: id(index),
    slot,
    vimeoId,
    bytes: 20_000_000,
    uploadedByUserId: OWNERS[index] ?? "",
    now: later(),
    staleBefore: new Date(NOON.getTime() - 60 * 60_000),
  });
  if (outcome.kind !== "started") throw new Error(`Start was refused: ${outcome.kind}`);
  return { video: outcome.video, stale: outcome.staleVimeoIds };
}

/** Vimeo has prepared it: the video goes live. */
async function complete(index: number, video: DirectoryVideo, durationMs = 15_800) {
  return completeDirectoryVideo(dbs.staff.db, {
    videoId: video.id,
    businessId: id(index),
    vimeoHash: "858a280296",
    posterUrl: POSTER,
    width: 1280,
    height: 720,
    durationMs,
    now: later(),
  });
}

/** Start and complete in one go: a live video. */
async function goLive(index: number, slot: DirectoryVideoSlot): Promise<DirectoryVideo> {
  const { video } = await start(index, slot);
  const done = await complete(index, video);
  if (done.kind !== "live") throw new Error(`Completing was refused: ${done.kind}`);
  return done.video;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  minutes = 0;
  vimeoCounter = 0;
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff@example.com" },
    ...OWNERS.map((owner, index) => ({ id: owner, name: `Owner ${index}`, email: `${owner}@example.com`, emailVerified: true })),
  ]);
  business = [];
  claims = [];
  for (const [index, owner] of OWNERS.entries()) {
    const created = await createListingAccountBusiness(dbs.staff.db, {
      userId: owner,
      listingKey: KEYS[index] ?? "",
      businessName: `Clinic ${index}`,
      phone: `+9198200000${index}0`,
    });
    business.push(created.businessId);
    claims.push(created.claimId);
  }
  // Both are Premium members unless a test says otherwise.
  await makeMember(0);
  await makeMember(1);
});

describe("starting an upload", () => {
  it("records a video waiting for its file, readable by its owner and nobody else", async () => {
    const { video, stale } = await start(0, 1, "1233986001");
    expect(video).toMatchObject({
      businessId: id(0),
      slot: 1,
      status: "pending",
      vimeoId: "1233986001",
      vimeoHash: null,
      posterUrl: null,
      width: null,
      height: null,
      durationMs: null,
      bytes: 20_000_000,
      decidedAt: null,
    });
    expect(stale).toEqual([]);

    expect(await asBusiness(0, (tx) => listDirectoryVideos(tx, id(0)))).toEqual([video]);
    expect(await asBusiness(1, (tx) => listDirectoryVideos(tx, id(0)))).toEqual([]);
    expect(await findPendingDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: video.id })).toEqual(video);
    // Another business's video is not found by this business's id, and neither is something that is not a UUID.
    expect(await findPendingDirectoryVideo(dbs.staff.db, { businessId: id(1), videoId: video.id })).toBeNull();
    expect(await findPendingDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: "not-a-uuid" })).toBeNull();
  });

  it("refuses a business that is not a Premium member", async () => {
    await dbs.staff.db.update(businesses).set({ kind: "listing" }).where(eq(businesses.id, id(0)));
    const outcome = await startDirectoryVideo(dbs.staff.db, {
      id: newDirectoryVideoId(),
      businessId: id(0),
      slot: 1,
      vimeoId: nextVimeoId(),
      bytes: 1000,
      uploadedByUserId: OWNERS[0],
      now: NOON,
      staleBefore: NOON,
    });
    expect(outcome).toEqual({ kind: "not-member" });
    expect(await listDirectoryVideos(dbs.staff.db, id(0))).toEqual([]);
  });

  it("refuses a member whose listing claim was rejected", async () => {
    await decideDirectoryClaim(dbs.staff.db, { claimId: claims[1] ?? "", approve: false, staffId: STAFF, now: NOON });
    const outcome = await startDirectoryVideo(dbs.staff.db, {
      id: newDirectoryVideoId(),
      businessId: id(1),
      slot: 1,
      vimeoId: nextVimeoId(),
      bytes: 1000,
      uploadedByUserId: OWNERS[1],
      now: NOON,
      staleBefore: NOON,
    });
    expect(outcome).toEqual({ kind: "no-claim" });
  });

  it("drops an upload that never finished in the same slot, and hands back its Vimeo id to delete", async () => {
    const first = await start(0, 2, "1233986011");
    const second = await start(0, 2, "1233986012");
    expect(second.stale).toEqual(["1233986011"]);
    expect((await listDirectoryVideos(dbs.staff.db, id(0))).map((video) => video.id)).toEqual([second.video.id]);
    expect(await findPendingDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: first.video.id })).toBeNull();
  });

  it("drops the business's older unfinished uploads in other slots too, but not recent ones", async () => {
    // An hour-old upload in slot 3 is forgotten; a fresh one in slot 1 is kept.
    await dbs.staff.db.insert(directoryVideos).values({
      id: newDirectoryVideoId(),
      businessId: id(0),
      slot: 3,
      vimeoId: "1233986099",
      bytes: 1000,
      uploadedByUserId: OWNERS[0],
      createdAt: new Date(NOON.getTime() - 3 * 60 * 60_000),
    });
    const recent = await start(0, 1, "1233986098");
    const next = await start(0, 2, "1233986097");
    expect(next.stale).toEqual([]);
    expect(recent.stale).toEqual(["1233986099"]);
    expect((await listDirectoryVideos(dbs.staff.db, id(0))).map((video) => video.slot)).toEqual([1, 2]);
  });

  it("lets the customer role write nothing", async () => {
    const { video } = await start(0, 1);
    const error = await captureErrorText(asBusiness(0, (tx) => tx.update(directoryVideos).set({ removedAt: NOON })));
    expect(error).toContain("permission denied");
    expect((await listDirectoryVideos(dbs.staff.db, id(0)))[0]).toEqual(video);
  });

  it("holds a row to slots 1 to 3, a Vimeo id of digits, and its own Vimeo poster address", async () => {
    const base = { id: newDirectoryVideoId(), businessId: id(0), vimeoId: "123", bytes: 1000, uploadedByUserId: OWNERS[0], createdAt: NOON };
    const fourth = await captureErrorText(dbs.staff.db.insert(directoryVideos).values({ ...base, slot: 4 as unknown as DirectoryVideoSlot }));
    expect(fourth).toContain("directory_videos_slot_check");
    const badId = await captureErrorText(dbs.staff.db.insert(directoryVideos).values({ ...base, id: newDirectoryVideoId(), slot: 1, vimeoId: "12 or 1=1" }));
    expect(badId).toContain("directory_videos_vimeo_id_check");
    const badPoster = await captureErrorText(
      dbs.staff.db.insert(directoryVideos).values({ ...base, id: newDirectoryVideoId(), slot: 1, posterUrl: "https://evil.example.com/x.jpg" }),
    );
    expect(badPoster).toContain("directory_videos_poster_check");
  });
});

describe("completing an upload", () => {
  it("makes the video live with what Vimeo reported, and hands back nothing to delete the first time", async () => {
    const { video } = await start(0, 1, "1233986021");
    const done = await complete(0, video);
    expect(done.kind).toBe("live");
    if (done.kind !== "live") return;
    expect(done.video).toMatchObject({
      id: video.id,
      status: "approved",
      vimeoId: "1233986021",
      vimeoHash: "858a280296",
      posterUrl: POSTER,
      width: 1280,
      height: 720,
      durationMs: 15_800,
    });
    expect(done.video.decidedAt).toBeInstanceOf(Date);
    expect(done.replacedVimeoIds).toEqual([]);
    expect(await findPendingDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: video.id })).toBeNull();
  });

  it("replaces the slot's live video at once and hands back its Vimeo id to delete", async () => {
    const first = await start(0, 1, "1233986031");
    await complete(0, first.video);
    const second = await start(0, 1, "1233986032");
    // The live one stays up while its replacement is being prepared.
    expect((await listDirectoryVideos(dbs.staff.db, id(0))).map((video) => [video.vimeoId, video.status])).toEqual([
      ["1233986031", "approved"],
      ["1233986032", "pending"],
    ]);
    const done = await complete(0, second.video);
    expect(done).toMatchObject({ kind: "live", replacedVimeoIds: ["1233986031"] });
    expect((await listDirectoryVideos(dbs.staff.db, id(0))).map((video) => [video.vimeoId, video.status])).toEqual([["1233986032", "approved"]]);
  });

  it("does nothing for a video that is not waiting, is another business's, or is not a UUID", async () => {
    const { video } = await start(0, 1);
    expect(await complete(1, video)).toEqual({ kind: "not-found" });
    expect(await complete(0, video)).toMatchObject({ kind: "live" });
    // Already live: completing again changes nothing.
    expect(await complete(0, video)).toEqual({ kind: "not-found" });
    expect(await completeDirectoryVideo(dbs.staff.db, { videoId: "not-a-uuid", businessId: id(0), vimeoHash: "abc123", posterUrl: POSTER, width: 1, height: 1, durationMs: 1, now: NOON })).toEqual({ kind: "not-found" });
  });

  it("refuses to take a video live for a business that stopped being a member while it was prepared", async () => {
    const { video } = await start(0, 1);
    await dbs.staff.db.update(businesses).set({ kind: "listing" }).where(eq(businesses.id, id(0)));
    expect(await complete(0, video)).toEqual({ kind: "not-member" });
    expect((await listDirectoryVideos(dbs.staff.db, id(0)))[0]).toMatchObject({ status: "pending" });
  });

  it("will not go live without what the page needs: a hash, a poster and a size", async () => {
    const { video } = await start(0, 1);
    const error = await captureErrorText(
      completeDirectoryVideo(dbs.staff.db, { videoId: video.id, businessId: id(0), vimeoHash: "", posterUrl: POSTER, width: 1280, height: 720, durationMs: 15_800, now: later() }),
    );
    expect(error).toContain("directory_videos");
  });
});

describe("discarding", () => {
  it("drops an upload that was refused (too long, or Vimeo could not read it) and hands back its Vimeo id", async () => {
    const { video } = await start(0, 1, "1233986041");
    expect(await discardDirectoryVideo(dbs.staff.db, { videoId: video.id, businessId: id(0), now: later() })).toBe("1233986041");
    expect(await listDirectoryVideos(dbs.staff.db, id(0))).toEqual([]);
    expect(await discardDirectoryVideo(dbs.staff.db, { videoId: video.id, businessId: id(0), now: later() })).toBeNull();
  });

  it("never discards a video that is live", async () => {
    const live = await goLive(0, 1);
    expect(await discardDirectoryVideo(dbs.staff.db, { videoId: live.id, businessId: id(0), now: later() })).toBeNull();
    expect(await listDirectoryVideos(dbs.staff.db, id(0))).toHaveLength(1);
  });
});

describe("staff", () => {
  it("lists the live videos newest first, with the business each belongs to", async () => {
    const a = await goLive(0, 1);
    const b = await goLive(1, 1);
    const c = await goLive(0, 2);
    await start(0, 3);
    const page = await listDirectoryVideosForStaff(dbs.staff.db, { status: "approved", limit: 10, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.videos.map((video) => video.id)).toEqual([c.id, b.id, a.id]);
    expect(page.videos[1]).toMatchObject({ businessName: "Clinic 1", listingKey: KEYS[1] });
    expect((await listDirectoryVideosForStaff(dbs.staff.db, { status: "approved", limit: 2, offset: 2 })).videos.map((video) => video.id)).toEqual([a.id]);
  });
});

describe("removing", () => {
  it("returns the Vimeo id of the slot's video, and leaves the other slots alone", async () => {
    const first = await goLive(0, 1);
    const other = await goLive(0, 2);
    expect(await removeDirectoryVideo(dbs.staff.db, { businessId: id(0), slot: 1, now: later() })).toEqual([first.vimeoId]);
    expect((await listDirectoryVideos(dbs.staff.db, id(0))).map((video) => video.id)).toEqual([other.id]);
  });

  it("returns every Vimeo id in the slot when a replacement is still being prepared", async () => {
    const live = await goLive(0, 1);
    const waiting = await start(0, 1, "1233986051");
    expect((await removeDirectoryVideo(dbs.staff.db, { businessId: id(0), slot: 1, now: later() })).sort()).toEqual([live.vimeoId, waiting.video.vimeoId].sort());
  });

  it("takes one video down for staff, and says nothing is left when it is already gone", async () => {
    const live = await goLive(0, 1);
    expect(await takeDownDirectoryVideo(dbs.staff.db, live.id, later())).toEqual([live.vimeoId]);
    expect(await takeDownDirectoryVideo(dbs.staff.db, live.id, later())).toEqual([]);
    expect(await takeDownDirectoryVideo(dbs.staff.db, "not-a-uuid", later())).toEqual([]);
  });
});

describe("what the public site may show", () => {
  it("shows a member's live video once its listing is approved, and nothing else", async () => {
    const live = await goLive(0, 1);
    // Live, but the listing's claim is not approved yet: nothing to show it on.
    expect((await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0]] })).size).toBe(0);

    await approveClaim(0);
    const shown = await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0]] });
    expect(shown.get(KEYS[0])).toEqual([
      { id: live.id, slot: 1, vimeoId: live.vimeoId, vimeoHash: "858a280296", posterUrl: POSTER, width: 1280, height: 720, durationMs: 15_800, featured: false },
    ]);

    // The membership ends: nothing is shown, and nothing is deleted.
    await dbs.staff.db.update(businesses).set({ kind: "listing" }).where(eq(businesses.id, id(0)));
    expect((await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0]] })).size).toBe(0);
    expect(await listDirectoryVideos(dbs.staff.db, id(0))).toHaveLength(1);
  });

  it("never shows a video that is still being prepared, or one staff took down", async () => {
    await approveClaim(0);
    await start(0, 1);
    expect((await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0]] })).size).toBe(0);
    const live = await goLive(0, 2);
    await takeDownDirectoryVideo(dbs.staff.db, live.id, later());
    expect((await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0]] })).size).toBe(0);
  });

  it("reads every live video of the asked businesses in slot order, by listing key", async () => {
    await approveClaim(0);
    await approveClaim(1);
    const third = await goLive(0, 3);
    const first = await goLive(0, 1);
    const other = await goLive(1, 2);

    const live = await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0], KEYS[1]] });
    expect(live.get(KEYS[0])?.map((video) => [video.id, video.slot])).toEqual([
      [first.id, 1],
      [third.id, 3],
    ]);
    expect(live.get(KEYS[1])?.map((video) => video.id)).toEqual([other.id]);
    expect((await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [] })).size).toBe(0);
  });
});

describe("the video shown at the top of the page", () => {
  const featuredOf = async (index: number): Promise<string[]> =>
    (await listDirectoryVideos(dbs.staff.db, id(index))).filter((video) => video.featured).map((video) => video.id);

  it("starts with none, and a live video can be chosen", async () => {
    const live = await goLive(0, 1);
    expect(live.featured).toBe(false);
    expect(await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: live.id })).toEqual({ kind: "set" });
    expect(await featuredOf(0)).toEqual([live.id]);
  });

  it("keeps only one: choosing another moves it, and choosing none clears it", async () => {
    const one = await goLive(0, 1);
    const two = await goLive(0, 2);
    await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: one.id });
    await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: two.id });
    expect(await featuredOf(0)).toEqual([two.id]);
    await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: null });
    expect(await featuredOf(0)).toEqual([]);
  });

  it("cannot choose a video that is still being prepared, another business's, or not a UUID", async () => {
    const waiting = (await start(0, 1)).video;
    const theirs = await goLive(1, 1);
    expect(await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: waiting.id })).toEqual({ kind: "not-found" });
    expect(await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: theirs.id })).toEqual({ kind: "not-found" });
    expect(await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: "nope" })).toEqual({ kind: "not-found" });
    expect(await featuredOf(0)).toEqual([]);
    expect(await featuredOf(1)).toEqual([]);
  });

  it("is refused for a business that is not a Premium member", async () => {
    const live = await goLive(0, 1);
    await dbs.staff.db.update(businesses).set({ kind: "listing" }).where(eq(businesses.id, id(0)));
    expect(await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: live.id })).toEqual({ kind: "not-member" });
  });

  it("passes to the video that replaces it, so replacing a clip keeps its place at the top", async () => {
    const first = await goLive(0, 1);
    await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: first.id });
    const second = await goLive(0, 1);
    expect(second.featured).toBe(true);
    expect(await featuredOf(0)).toEqual([second.id]);
  });

  it("does not pass to a replacement in another slot, and goes when the video is removed", async () => {
    const first = await goLive(0, 1);
    await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: first.id });
    const other = await goLive(0, 2);
    expect(other.featured).toBe(false);
    await removeDirectoryVideo(dbs.staff.db, { businessId: id(0), slot: 1, now: later() });
    expect(await featuredOf(0)).toEqual([]);
  });

  it("is what the public site reads", async () => {
    await approveClaim(0);
    const one = await goLive(0, 1);
    const two = await goLive(0, 2);
    await setFeaturedDirectoryVideo(dbs.staff.db, { businessId: id(0), videoId: two.id });
    const read = await readLiveDirectoryVideos(dbs.staff.db, { placeIds: [], unplacedKeys: [KEYS[0]] });
    expect([...read.values()][0]?.map((video) => [video.id, video.featured])).toEqual([
      [one.id, false],
      [two.id, true],
    ]);
  });

  it("cannot be set on a video that is not live, whatever is written", async () => {
    const waiting = (await start(0, 3)).video;
    const message = await captureErrorText(dbs.staff.db.update(directoryVideos).set({ featured: true }).where(eq(directoryVideos.id, waiting.id)));
    expect(message).toContain("directory_videos_featured_check");
  });
});
