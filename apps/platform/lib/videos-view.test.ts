import { describe, expect, it } from "vitest";
import type { DirectoryVideo } from "@brandbasket/db";
import { formatVideoDuration, videoAccessOf, videoStatusText, videoTiles } from "./videos-view";

function video(overrides: Partial<DirectoryVideo> & Pick<DirectoryVideo, "id" | "slot">): DirectoryVideo {
  return {
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    status: "approved",
    vimeoId: "1233986429",
    vimeoHash: "858a280296",
    posterUrl: "https://i.vimeocdn.com/video/1-aaa_640x360",
    width: 1280,
    height: 720,
    durationMs: 15_800,
    bytes: 3_000_000,
    featured: false,
    createdAt: new Date("2026-10-07T06:30:00.000Z"),
    decidedAt: new Date("2026-10-07T06:30:00.000Z"),
    ...overrides,
  };
}

describe("videoAccessOf", () => {
  it("lets a Premium member with a listing add videos", () => {
    expect(videoAccessOf("website", "approved")).toBe("ok");
    expect(videoAccessOf("website", "pending")).toBe("ok");
  });

  it("says a free listing account is not a member, whatever its listing", () => {
    expect(videoAccessOf("listing", "approved")).toBe("not-member");
    expect(videoAccessOf("listing", null)).toBe("not-member");
  });

  it("says a member with no listing, or a refused one, has nothing for a video to show on", () => {
    expect(videoAccessOf("website", null)).toBe("no-listing");
    expect(videoAccessOf("website", "rejected")).toBe("no-listing");
  });
});

describe("videoTiles", () => {
  it("is locked for an account that is not a member, with no tiles at all", () => {
    expect(videoTiles([], "not-member")).toEqual({ kind: "locked" });
  });

  it("asks a member with no listing to add it first", () => {
    expect(videoTiles([], "no-listing")).toEqual({ kind: "needs-listing" });
  });

  it("gives a member three tiles in slot order: a live video, one being got ready, or an empty place for the next one", () => {
    const view = videoTiles(
      [video({ id: "c", slot: 3 }), video({ id: "b", slot: 2, status: "pending", vimeoHash: null, posterUrl: null, width: null, height: null, durationMs: null, decidedAt: null })],
      "ok",
    );
    expect(view.kind).toBe("tiles");
    if (view.kind !== "tiles") return;
    expect(view.tiles.map((tile) => [tile.slot, tile.state, tile.video?.id ?? null, tile.pending?.id ?? null])).toEqual([
      [1, "empty", null, null],
      [2, "preparing", null, "b"],
      [3, "live", "c", null],
    ]);
  });

  it("keeps a live video on show while its replacement is being got ready", () => {
    const view = videoTiles(
      [video({ id: "old", slot: 1 }), video({ id: "new", slot: 1, status: "pending", vimeoHash: null, posterUrl: null, width: null, height: null, durationMs: null, decidedAt: null })],
      "ok",
    );
    if (view.kind !== "tiles") throw new Error("Expected tiles");
    expect(view.tiles[0]).toMatchObject({ slot: 1, state: "preparing" });
    expect(view.tiles[0]?.video?.id).toBe("old");
    expect(view.tiles[0]?.pending?.id).toBe("new");
  });
});

describe("videoStatusText", () => {
  it("says a live video is live, one being got ready is getting ready, and an empty place nothing", () => {
    expect(videoStatusText("live")).toBe("Live on your page.");
    expect(videoStatusText("preparing")).toBe("Getting it ready. It shows on your page in a minute or two.");
    expect(videoStatusText("empty")).toBe("");
  });
});

describe("formatVideoDuration", () => {
  it("reads minutes and seconds, rounding to the nearest second", () => {
    expect(formatVideoDuration(15_800)).toBe("0:16");
    expect(formatVideoDuration(16_000)).toBe("0:16");
    expect(formatVideoDuration(4_400)).toBe("0:04");
    expect(formatVideoDuration(0)).toBe("0:00");
    expect(formatVideoDuration(65_000)).toBe("1:05");
  });
});
