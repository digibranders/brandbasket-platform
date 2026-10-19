import type { DueClosure, ErasureOutcome } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAccountErasure, type ErasureDeps } from "./account-erasure-run";

const NOW = new Date("2026-12-01T00:00:00Z");
const CLOSURE: DueClosure = { id: "closure-1", userId: "user-1", businessId: "biz-1", eraseAfter: new Date("2026-11-20T00:00:00Z") };
const ERASED: ErasureOutcome = { kind: "erased", closureId: "closure-1", userId: "user-1", businessId: "biz-1", storageKeys: ["t/biz-1/a/display", "t/biz-1/b/display"], vimeoIds: ["111", "222", "333"] };

let calls: string[];
let deps: ErasureDeps;

beforeEach(() => {
  calls = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  deps = {
    listDue: vi.fn(async () => [CLOSURE]),
    findBlock: vi.fn(async () => {
      calls.push("block?");
      return null;
    }),
    eraseWebsiteContent: vi.fn(async () => {
      calls.push("website");
    }),
    eraseRows: vi.fn(async () => {
      calls.push("rows");
      return ERASED;
    }),
    deleteFiles: vi.fn(async () => {
      calls.push("files");
      return [];
    }),
    deleteVimeoVideos: vi.fn(async () => {
      calls.push("videos");
      return [];
    }),
  };
});

describe("runAccountErasure", () => {
  it("checks, then clears the website, then the rows, then the files", async () => {
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(calls).toEqual(["block?", "website", "rows", "files", "videos"]);
    expect(deps.deleteVimeoVideos).toHaveBeenCalledWith(ERASED.vimeoIds);
    expect(deps.deleteFiles).toHaveBeenCalledWith(ERASED.storageKeys);
    expect(report).toEqual({ dryRun: false, due: 1, items: [{ closureId: "closure-1", status: "erased", files: 2, filesNotRemoved: 0, videos: 3, videosNotRemoved: 0 }] });
  });

  it("asks for no more than the limit", async () => {
    await runAccountErasure(deps, { now: NOW, limit: 3, dryRun: false });
    expect(deps.listDue).toHaveBeenCalledWith(NOW, 3);
  });

  it("changes nothing in a dry run, and says what it would do", async () => {
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: true });
    expect(calls).toEqual(["block?"]);
    expect(report.items).toEqual([{ closureId: "closure-1", status: "would-erase" }]);
  });

  it("touches nothing of a closure that is blocked, the website content included", async () => {
    vi.mocked(deps.findBlock).mockResolvedValue("subscription-live");
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(deps.eraseWebsiteContent).not.toHaveBeenCalled();
    expect(deps.eraseRows).not.toHaveBeenCalled();
    expect(report.items).toEqual([{ closureId: "closure-1", status: "skipped", reason: "subscription-live" }]);
  });

  it("leaves the rows alone when the website content cannot be cleared, so the next run tries again", async () => {
    vi.mocked(deps.eraseWebsiteContent).mockRejectedValue(new Error("cms down"));
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(deps.eraseRows).not.toHaveBeenCalled();
    expect(report.items).toEqual([{ closureId: "closure-1", status: "failed", stage: "website-content" }]);
  });

  it("reports a failed erase of the rows and removes no files", async () => {
    vi.mocked(deps.eraseRows).mockRejectedValue(new Error("db down"));
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(deps.deleteFiles).not.toHaveBeenCalled();
    expect(deps.deleteVimeoVideos).not.toHaveBeenCalled();
    expect(report.items).toEqual([{ closureId: "closure-1", status: "failed", stage: "rows" }]);
  });

  it("reports a skip the transaction found under its own lock (restored a moment ago), and removes no files", async () => {
    vi.mocked(deps.eraseRows).mockResolvedValue({ kind: "skipped", closureId: "closure-1", reason: "not-due" });
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(deps.deleteFiles).not.toHaveBeenCalled();
    expect(deps.deleteVimeoVideos).not.toHaveBeenCalled();
    expect(report.items).toEqual([{ closureId: "closure-1", status: "skipped", reason: "not-due" }]);
  });

  it("counts files that could not be removed without failing the erase", async () => {
    vi.mocked(deps.deleteFiles).mockResolvedValue(["t/biz-1/a/display"]);
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(report.items).toEqual([{ closureId: "closure-1", status: "erased", files: 2, filesNotRemoved: 1, videos: 3, videosNotRemoved: 0 }]);
  });

  it("reports a video it could not delete from Vimeo, and still counts the account as erased", async () => {
    vi.mocked(deps.deleteVimeoVideos).mockResolvedValue(["222"]);
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(report.items).toEqual([{ closureId: "closure-1", status: "erased", files: 2, filesNotRemoved: 0, videos: 3, videosNotRemoved: 1 }]);
  });

  it("goes on to the next account after one fails", async () => {
    const second: DueClosure = { ...CLOSURE, id: "closure-2", businessId: "biz-2" };
    vi.mocked(deps.listDue).mockResolvedValue([CLOSURE, second]);
    vi.mocked(deps.eraseWebsiteContent).mockRejectedValueOnce(new Error("cms down"));
    const report = await runAccountErasure(deps, { now: NOW, limit: 10, dryRun: false });
    expect(report.items.map((item) => item.status)).toEqual(["failed", "erased"]);
  });
});
