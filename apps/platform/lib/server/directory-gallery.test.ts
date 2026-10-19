import { describe, expect, it, vi } from "vitest";
import type { DirectoryLookup, LiveDirectoryPictures, LiveDirectoryVideo, ResolvedDirectoryAsk } from "@brandbasket/db";
import { galleryResponseSchema } from "@/lib/directory-api";
import { galleryEntryOf, readGalleries, type GalleryDeps } from "./directory-gallery";

vi.mock("server-only", () => ({}));

const ID = (n: number): string => `0192f3c4-0000-7000-8000-${String(n).padStart(12, "0")}`;

const NO_SLOTS = {
  listing: null,
  ad_tall: null,
  ad_wide: null,
  banner: null,
  gallery_1: null,
  gallery_2: null,
  gallery_3: null,
  gallery_4: null,
  gallery_5: null,
  gallery_6: null,
} satisfies LiveDirectoryPictures;

function video(n: number, slot: 1 | 2 | 3): LiveDirectoryVideo {
  return {
    id: ID(n),
    slot,
    vimeoId: String(1_233_986_000 + n),
    vimeoHash: "858a280296",
    posterUrl: `https://i.vimeocdn.com/video/${String(n)}-aaa_640x360`,
    width: 1280,
    height: 720,
    durationMs: 15_800,
    featured: false,
  };
}

describe("galleryEntryOf", () => {
  it("lists the gallery photos in slot order, skipping empty slots and every other kind of picture", () => {
    const pictures: LiveDirectoryPictures = {
      ...NO_SLOTS,
      listing: ID(1),
      banner: ID(2),
      ad_tall: ID(3),
      gallery_1: ID(10),
      gallery_3: ID(30),
      gallery_6: ID(60),
    };
    expect(galleryEntryOf(pictures, undefined)).toEqual({ photos: [ID(10), ID(30), ID(60)], videos: [] });
  });

  it("describes each video by its Vimeo player address and poster, with its length in seconds", () => {
    const entry = galleryEntryOf(undefined, [video(1, 1), video(2, 3)]);
    expect(entry).toEqual({
      photos: [],
      videos: [
        {
          id: ID(1),
          embed: "https://player.vimeo.com/video/1233986001?h=858a280296&dnt=1&title=0&byline=0&portrait=0",
          poster: "https://i.vimeocdn.com/video/1-aaa_640x360",
          seconds: 15.8,
          width: 1280,
          height: 720,
          featured: false,
        },
        {
          id: ID(2),
          embed: "https://player.vimeo.com/video/1233986002?h=858a280296&dnt=1&title=0&byline=0&portrait=0",
          poster: "https://i.vimeocdn.com/video/2-aaa_640x360",
          seconds: 15.8,
          width: 1280,
          height: 720,
          featured: false,
        },
      ],
    });
  });

  it("says which video the owner chose for the top of the page", () => {
    const entry = galleryEntryOf(undefined, [video(1, 1), { ...video(2, 2), featured: true }]);
    expect(entry?.videos.map((shown) => shown.featured)).toEqual([false, true]);
  });

  it("is an answer the website's contract accepts, so nothing the platform sends can be refused as malformed", () => {
    const entry = galleryEntryOf({ ...NO_SLOTS, gallery_1: ID(10) }, [video(1, 1)]);
    expect(galleryResponseSchema.safeParse({ galleries: { p1: entry } }).success).toBe(true);
  });

  it("has nothing for a business with neither photos nor videos", () => {
    expect(galleryEntryOf(undefined, undefined)).toBeNull();
    expect(galleryEntryOf({ ...NO_SLOTS, listing: ID(1) }, [])).toBeNull();
  });
});

describe("readGalleries", () => {
  const resolved: ResolvedDirectoryAsk = {
    lookup: { placeIds: ["p1"], unplacedKeys: [] },
    // Two names for one business, as an old listing key and its permanent id are.
    readAs: new Map([
      ["p1", "p1"],
      ["dentists/thane/naupada/smile", "p1"],
      ["dentists/thane/naupada/empty", "dentists/thane/naupada/empty"],
    ]),
  };

  function deps(overrides: Partial<GalleryDeps> = {}): GalleryDeps {
    return {
      resolveAsk: vi.fn().mockResolvedValue(resolved),
      livePictures: vi.fn().mockResolvedValue(new Map([["p1", { ...NO_SLOTS, gallery_1: ID(10) }]])),
      liveVideos: vi.fn().mockResolvedValue(new Map([["p1", [video(1, 1)]]])),
      ...overrides,
    };
  }

  it("answers under every id and key the business was asked by, and leaves out one with nothing", async () => {
    const answer = await readGalleries({ ids: ["p1"], keys: ["dentists/thane/naupada/smile", "dentists/thane/naupada/empty"] }, deps());
    expect(Object.keys(answer.galleries).sort()).toEqual(["dentists/thane/naupada/smile", "p1"]);
    expect(answer.galleries.p1).toEqual(answer.galleries["dentists/thane/naupada/smile"]);
    expect(answer.galleries.p1?.photos).toEqual([ID(10)]);
    expect(answer.galleries.p1?.videos).toHaveLength(1);
  });

  it("reads the photos and the videos of every business in one go, from the resolved lookup", async () => {
    const d = deps();
    await readGalleries({ ids: ["p1"], keys: [] }, d);
    const lookup: DirectoryLookup = resolved.lookup;
    expect(d.livePictures).toHaveBeenCalledTimes(1);
    expect(d.livePictures).toHaveBeenCalledWith(lookup);
    expect(d.liveVideos).toHaveBeenCalledTimes(1);
    expect(d.liveVideos).toHaveBeenCalledWith(lookup);
  });

  it("answers an empty gallery list when no business has anything", async () => {
    const answer = await readGalleries(
      { ids: ["p1"], keys: [] },
      deps({ livePictures: vi.fn().mockResolvedValue(new Map()), liveVideos: vi.fn().mockResolvedValue(new Map()) }),
    );
    expect(answer).toEqual({ galleries: {} });
  });
});
