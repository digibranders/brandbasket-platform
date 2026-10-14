import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createListingAccountBusiness, createUnlistedAccountBusiness, decideDirectoryClaim } from "./queries/directory-ads";
import {
  countWaitingDirectoryPictures,
  decideDirectoryPicture,
  findDirectoryPictureFileForStaff,
  findLiveDirectoryPictureFile,
  findOwnDirectoryPictureFile,
  findPreviewDirectoryPictureFile,
  listDirectoryPictureKeys,
  listDirectoryPictures,
  listDirectoryPicturesForStaff,
  newDirectoryPictureId,
  readLiveDirectoryPictures,
  readOwnApprovedDirectoryPictures,
  recordDirectoryPicture,
  removeDirectoryPictures,
  takeDownDirectoryPicture,
  type DirectoryPicture,
} from "./queries/directory-pictures";
import { businessUrlCode } from "./place-id";
import { businesses, DIRECTORY_PICTURE_SLOTS, directoryClaims, directoryPictures, directoryPlaces, users, type DirectoryPictureSlot } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import type { DirectoryLookup } from "./queries/directory-refs";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

/** The slots added for the Business profile's banner and gallery: empty in every answer that does not name them. */
const NO_OTHER_SLOTS = Object.fromEntries(DIRECTORY_PICTURE_SLOTS.filter((slot) => slot === "banner" || slot.startsWith("gallery_")).map((slot) => [slot, null]));

const STAFF = "staff-1";
const OWNERS = ["owner-a", "owner-b"] as const;
const KEYS = ["dentists/thane/naupada/smile-dental", "dentists/thane/naupada/bright-teeth"] as const;
const SHA = "a".repeat(64);
const NOON = new Date("2026-09-30T06:30:00.000Z");

let dbs: TestDatabases;
let business: string[] = [];
let claims: string[] = [];

function byKeys(listingKeys: readonly string[]): DirectoryLookup {
  return { placeIds: [], unplacedKeys: listingKeys };
}
let minutes = 0;

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

function keyOf(businessId: string, pictureId: string): string {
  return `t/${businessId}/${pictureId}/display`;
}

async function upload(index: number, slot: DirectoryPictureSlot): Promise<{ readonly picture: DirectoryPicture; readonly replaced: readonly string[] }> {
  const pictureId = newDirectoryPictureId();
  const outcome = await recordDirectoryPicture(dbs.staff.db, {
    id: pictureId,
    businessId: id(index),
    slot,
    storageKey: keyOf(id(index), pictureId),
    mimeType: "image/webp",
    bytes: 40_000,
    width: 640,
    height: 640,
    sha256: SHA,
    uploadedByUserId: OWNERS[index] ?? "",
    now: later(),
  });
  if (outcome.kind !== "recorded") throw new Error(`Upload was refused: ${outcome.kind}`);
  return { picture: outcome.picture, replaced: outcome.replacedStorageKeys };
}

function decide(pictureId: string, approve: boolean) {
  return decideDirectoryPicture(dbs.staff.db, { pictureId, approve, staffId: STAFF, now: later() });
}

async function approveClaim(index: number): Promise<void> {
  const claimId = claims[index];
  if (claimId === undefined) throw new Error(`No claim ${index}`);
  await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: NOON });
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
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff@example.com" },
    // Owners who have confirmed their email address, as an approval requires.
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
});

describe("uploading", () => {
  it("records a picture as waiting, readable by its owner and nobody else", async () => {
    const { picture, replaced } = await upload(0, "listing");
    expect(picture).toMatchObject({ businessId: id(0), slot: "listing", status: "pending", width: 640, height: 640, decidedAt: null });
    expect(replaced).toEqual([]);

    expect(await asBusiness(0, (tx) => listDirectoryPictures(tx, id(0)))).toEqual([picture]);
    expect(await asBusiness(1, (tx) => listDirectoryPictures(tx, id(0)))).toEqual([]);
    expect(await asBusiness(0, (tx) => findOwnDirectoryPictureFile(tx, id(0), picture.id))).toEqual({
      storageKey: keyOf(id(0), picture.id),
      mimeType: "image/webp",
      sha256: SHA,
    });
    expect(await asBusiness(1, (tx) => findOwnDirectoryPictureFile(tx, id(0), picture.id))).toBeNull();
    expect(await asBusiness(0, (tx) => findOwnDirectoryPictureFile(tx, id(0), "not-a-uuid"))).toBeNull();
  });

  it("replaces the waiting picture of the same slot and leaves other slots alone", async () => {
    const first = await upload(0, "ad_tall");
    const wide = await upload(0, "ad_wide");
    const second = await upload(0, "ad_tall");
    expect(second.replaced).toEqual([keyOf(id(0), first.picture.id)]);
    const current = await listDirectoryPictures(dbs.staff.db, id(0));
    expect(current.map((picture) => picture.id)).toEqual([wide.picture.id, second.picture.id]);
  });

  it("takes a free listing account with no claim yet, and refuses a rejected claim and a business that is not a listing account", async () => {
    await dbs.staff.db.insert(users).values({ id: "owner-c", name: "No claim", email: "owner-c@example.com" });
    const unlisted = await createUnlistedAccountBusiness(dbs.staff.db, { userId: "owner-c", businessName: "Not added yet" });
    const pictureId = newDirectoryPictureId();
    const input = {
      id: pictureId,
      slot: "listing" as const,
      mimeType: "image/webp",
      bytes: 1,
      width: 640,
      height: 640,
      sha256: SHA,
      now: NOON,
    };
    expect(
      await recordDirectoryPicture(dbs.staff.db, {
        ...input,
        businessId: unlisted.businessId,
        storageKey: keyOf(unlisted.businessId, pictureId),
        uploadedByUserId: "owner-c",
      }),
    ).toMatchObject({ kind: "recorded", picture: { status: "pending" } });

    // The Business profile's Photos tab comes before its Listing tab, but a website client's pictures are its site's.
    await dbs.staff.db.update(businesses).set({ kind: "website" }).where(eq(businesses.id, unlisted.businessId));
    const otherId = newDirectoryPictureId();
    expect(
      await recordDirectoryPicture(dbs.staff.db, {
        ...input,
        id: otherId,
        businessId: unlisted.businessId,
        storageKey: keyOf(unlisted.businessId, otherId),
        uploadedByUserId: "owner-c",
      }),
    ).toEqual({ kind: "no-claim" });

    await decideDirectoryClaim(dbs.staff.db, { claimId: claims[1] ?? "", approve: false, staffId: STAFF, now: NOON });
    expect(
      await recordDirectoryPicture(dbs.staff.db, { ...input, businessId: id(1), storageKey: keyOf(id(1), pictureId), uploadedByUserId: OWNERS[1] }),
    ).toEqual({ kind: "no-claim" });
  });

  it("lets the customer role write nothing", async () => {
    const { picture } = await upload(0, "listing");
    const error = await captureErrorText(
      asBusiness(0, (tx) => tx.update(directoryPictures).set({ status: "approved", decidedAt: NOON, decidedByUserId: STAFF })),
    );
    expect(error).toContain("permission denied");
    expect((await listDirectoryPictures(dbs.staff.db, id(0)))[0]).toEqual(picture);
  });

  it("holds a row to its own business's storage key", async () => {
    const pictureId = newDirectoryPictureId();
    const error = await captureErrorText(
      recordDirectoryPicture(dbs.staff.db, {
        id: pictureId,
        businessId: id(0),
        slot: "listing",
        storageKey: keyOf(id(1), pictureId),
        mimeType: "image/webp",
        bytes: 1,
        width: 640,
        height: 640,
        sha256: SHA,
        uploadedByUserId: OWNERS[0],
        now: NOON,
      }),
    );
    expect(error).toContain("directory_pictures_storage_key_check");
  });
});

describe("the staff check", () => {
  it("queues waiting pictures oldest first with their business", async () => {
    const first = await upload(0, "listing");
    const second = await upload(1, "ad_wide");
    expect(await countWaitingDirectoryPictures(dbs.staff.db)).toBe(2);
    const page = await listDirectoryPicturesForStaff(dbs.staff.db, { status: "pending", limit: 10, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.pictures.map((picture) => [picture.id, picture.businessName, picture.listingKey, picture.claimStatus])).toEqual([
      [first.picture.id, "Clinic 0", KEYS[0], "pending"],
      [second.picture.id, "Clinic 1", KEYS[1], "pending"],
    ]);
    expect(await findDirectoryPictureFileForStaff(dbs.staff.db, first.picture.id)).toMatchObject({ storageKey: keyOf(id(0), first.picture.id) });
  });

  it("keeps the live picture up while its replacement waits, and swaps them on approval", async () => {
    await approveClaim(0);
    const first = await upload(0, "listing");
    expect(await decide(first.picture.id, true)).toEqual({ kind: "decided", replacedStorageKeys: [] });

    const second = await upload(0, "listing");
    expect(second.replaced).toEqual([]);
    expect((await readLiveDirectoryPictures(dbs.staff.db, byKeys([KEYS[0]]))).get(KEYS[0])?.listing).toBe(first.picture.id);

    expect(await decide(second.picture.id, true)).toEqual({ kind: "decided", replacedStorageKeys: [keyOf(id(0), first.picture.id)] });
    expect((await readLiveDirectoryPictures(dbs.staff.db, byKeys([KEYS[0]]))).get(KEYS[0])?.listing).toBe(second.picture.id);
    expect(await findLiveDirectoryPictureFile(dbs.staff.db, first.picture.id)).toBeNull();
    expect((await listDirectoryPictures(dbs.staff.db, id(0))).map((picture) => [picture.id, picture.status])).toEqual([
      [second.picture.id, "approved"],
    ]);
  });

  it("lists the key of every picture that still has a file, and none that were removed", async () => {
    await approveClaim(0);
    const kept = await upload(0, "listing");
    const waiting = await upload(0, "ad_tall");
    const other = await upload(1, "listing");
    const removedKeys = await removeDirectoryPictures(dbs.staff.db, { businessId: id(1), slots: ["listing"], now: later() });
    expect(removedKeys).toEqual([keyOf(id(1), other.picture.id)]);

    const keys = await listDirectoryPictureKeys(dbs.staff.db);

    expect([...keys].map((entry) => entry.id).sort()).toEqual([kept.picture.id, waiting.picture.id].sort());
    expect(keys.find((entry) => entry.id === kept.picture.id)?.storageKey).toBe(keyOf(id(0), kept.picture.id));
  });

  it("keeps a refused picture for its owner to see, off the website, until it is replaced", async () => {
    await approveClaim(0);
    const refused = await upload(0, "ad_tall");
    expect(await decide(refused.picture.id, false)).toEqual({ kind: "decided", replacedStorageKeys: [] });
    expect(await countWaitingDirectoryPictures(dbs.staff.db)).toBe(0);
    expect((await listDirectoryPictures(dbs.staff.db, id(0)))[0]).toMatchObject({ id: refused.picture.id, status: "rejected" });
    expect(await findLiveDirectoryPictureFile(dbs.staff.db, refused.picture.id)).toBeNull();

    const next = await upload(0, "ad_tall");
    expect(next.replaced).toEqual([keyOf(id(0), refused.picture.id)]);
  });

  it("decides a picture once", async () => {
    const { picture } = await upload(0, "listing");
    expect((await decide(picture.id, true)).kind).toBe("decided");
    expect(await decide(picture.id, false)).toEqual({ kind: "not-found" });
    expect(await decide("not-a-uuid", true)).toEqual({ kind: "not-found" });
  });

  it("takes a live picture down", async () => {
    await approveClaim(0);
    const { picture } = await upload(0, "listing");
    await decide(picture.id, true);
    expect(await takeDownDirectoryPicture(dbs.staff.db, picture.id, later())).toBe(keyOf(id(0), picture.id));
    expect(await takeDownDirectoryPicture(dbs.staff.db, picture.id, later())).toBeNull();
    expect(await readLiveDirectoryPictures(dbs.staff.db, byKeys([KEYS[0]]))).toEqual(new Map());
  });
});

describe("what the website shows", () => {
  it("shows only approved pictures of approved claims, by slot", async () => {
    const photo = await upload(0, "listing");
    const tall = await upload(0, "ad_tall");
    await upload(0, "ad_wide");
    await decide(photo.picture.id, true);
    await decide(tall.picture.id, true);

    // Approved pictures, but the claim is still waiting for its call.
    expect(await readLiveDirectoryPictures(dbs.staff.db, byKeys([...KEYS]))).toEqual(new Map());
    expect(await findLiveDirectoryPictureFile(dbs.staff.db, photo.picture.id)).toBeNull();

    await approveClaim(0);
    expect(await readLiveDirectoryPictures(dbs.staff.db, byKeys([...KEYS, KEYS[0]]))).toEqual(
      new Map([[KEYS[0], { listing: photo.picture.id, ad_tall: tall.picture.id, ad_wide: null, ...NO_OTHER_SLOTS }]]),
    );
    expect(await findLiveDirectoryPictureFile(dbs.staff.db, photo.picture.id)).toEqual({
      storageKey: keyOf(id(0), photo.picture.id),
      mimeType: "image/webp",
      sha256: SHA,
    });
    expect(await readLiveDirectoryPictures(dbs.staff.db, byKeys([]))).toEqual(new Map());
  });

  it("removes the chosen slots, live and waiting alike", async () => {
    await approveClaim(0);
    const photo = await upload(0, "listing");
    const tall = await upload(0, "ad_tall");
    await decide(tall.picture.id, true);
    const newerTall = await upload(0, "ad_tall");
    const wide = await upload(0, "ad_wide");

    const removed = await removeDirectoryPictures(dbs.staff.db, { businessId: id(0), slots: ["ad_tall", "ad_wide"], now: later() });
    expect([...removed].sort()).toEqual([tall, newerTall, wide].map((entry) => keyOf(id(0), entry.picture.id)).sort());
    expect((await listDirectoryPictures(dbs.staff.db, id(0))).map((picture) => picture.id)).toEqual([photo.picture.id]);
    expect(await removeDirectoryPictures(dbs.staff.db, { businessId: id(0), slots: [], now: later() })).toEqual([]);
  });
});

describe("the owner's live preview of a page that is not live yet", () => {
  const PLACE = "6sunr2s";

  /** Gives the first business's claim a place, as the Listing tab does, whatever its state. */
  async function placeFirstBusiness(): Promise<string> {
    await dbs.staff.db.insert(directoryPlaces).values({ id: PLACE, origin: "client", stateCode: "mh", citySlug: "thane", urlSlug: "sunrise-bakery" });
    await dbs.staff.db.update(directoryClaims).set({ placeId: PLACE }).where(eq(directoryClaims.businessId, id(0)));
    return businessUrlCode(PLACE);
  }

  it("serves an approved picture of a business whose claim is still waiting, to the page address it belongs to and no other", async () => {
    const code = await placeFirstBusiness();
    const photo = await upload(0, "listing");
    await decide(photo.picture.id, true);

    // Not live: the claim has not been approved, so the ordinary route is refused it.
    expect(await findLiveDirectoryPictureFile(dbs.staff.db, photo.picture.id)).toBeNull();
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, photo.picture.id, code)).toEqual({
      storageKey: keyOf(id(0), photo.picture.id),
      mimeType: "image/webp",
      sha256: SHA,
    });
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, photo.picture.id, "zzzzzzzzzz")).toBeNull();
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, "not-a-uuid", code)).toBeNull();
  });

  it("does not serve another business's picture under this business's page address", async () => {
    const code = await placeFirstBusiness();
    const other = await upload(1, "listing");
    await decide(other.picture.id, true);
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, other.picture.id, code)).toBeNull();
  });

  it("does not serve a picture staff have not approved, one that was removed, or one on a refused claim", async () => {
    const code = await placeFirstBusiness();
    const waiting = await upload(0, "gallery_1");
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, waiting.picture.id, code)).toBeNull();

    const approved = await upload(0, "gallery_2");
    await decide(approved.picture.id, true);
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, approved.picture.id, code)).not.toBeNull();
    await removeDirectoryPictures(dbs.staff.db, { businessId: id(0), slots: ["gallery_2"], now: later() });
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, approved.picture.id, code)).toBeNull();

    const kept = await upload(0, "gallery_3");
    await decide(kept.picture.id, true);
    await decideDirectoryClaim(dbs.staff.db, { claimId: claims[0] ?? "", approve: false, staffId: STAFF, now: NOON });
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, kept.picture.id, code)).toBeNull();
  });

  it("serves nothing for a claim that has no place yet", async () => {
    const photo = await upload(0, "listing");
    await decide(photo.picture.id, true);
    expect(await findPreviewDirectoryPictureFile(dbs.staff.db, photo.picture.id, businessUrlCode(PLACE))).toBeNull();
  });

  it("lists a business's own approved pictures by slot, live page or not, and leaves out waiting and removed ones", async () => {
    const photo = await upload(0, "listing");
    const gallery = await upload(0, "gallery_1");
    await upload(0, "gallery_2");
    const gone = await upload(0, "gallery_3");
    await decide(photo.picture.id, true);
    await decide(gallery.picture.id, true);
    await decide(gone.picture.id, true);
    await removeDirectoryPictures(dbs.staff.db, { businessId: id(0), slots: ["gallery_3"], now: later() });

    const own = await readOwnApprovedDirectoryPictures(dbs.staff.db, id(0));
    expect(own.listing).toBe(photo.picture.id);
    expect(own.gallery_1).toBe(gallery.picture.id);
    expect(own.gallery_2).toBeNull();
    expect(own.gallery_3).toBeNull();
    expect(Object.values(await readOwnApprovedDirectoryPictures(dbs.staff.db, id(1))).every((value) => value === null)).toBe(true);
  });
});
