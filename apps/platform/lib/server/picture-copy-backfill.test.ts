import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalMediaStorage, mediaStorageKey, type MediaStorage } from "@brandbasket/shared/server/media-storage";
import { backfillPictureCopies, formatBackfillReport } from "./picture-copy-backfill";

vi.mock("server-only", () => ({}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const A = "0192f3c4-aaaa-7000-8000-00000000000a";
const B = "0192f3c4-bbbb-7000-8000-00000000000b";
const GONE = "0192f3c4-cccc-7000-8000-00000000000c";
const keyOf = (id: string, variant: "display" | "w320" | "w640" = "display"): string => mediaStorageKey(BUSINESS_ID, id, variant);

let sandbox = "";
let storage: MediaStorage;

async function webp(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#336699" } }).webp().toBuffer());
}

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "brandbasket-backfill-"));
  storage = createLocalMediaStorage(sandbox);
  await storage.put(keyOf(A), await webp(960, 600), "image/webp");
  await storage.put(keyOf(B), await webp(640, 640), "image/webp");
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

const pictures = [
  { id: A, storageKey: keyOf(A) },
  { id: B, storageKey: keyOf(B) },
];

describe("backfillPictureCopies", () => {
  it("writes the copies each picture should have", async () => {
    const report = await backfillPictureCopies({ pictures, storage, dryRun: false });

    expect(report).toMatchObject({ pictures: 2, copiesMade: 3, alreadyDone: 0, failed: [] });
    expect(await storage.get(keyOf(A, "w320"))).not.toBeNull();
    expect(await storage.get(keyOf(A, "w640"))).not.toBeNull();
    expect(await storage.get(keyOf(B, "w320"))).not.toBeNull();
    expect(await storage.get(keyOf(B, "w640"))).toBeNull();
  });

  it("writes nothing in a dry run but reports what it would do", async () => {
    const report = await backfillPictureCopies({ pictures, storage, dryRun: true });

    expect(report.copiesMade).toBe(3);
    expect(await storage.get(keyOf(A, "w320"))).toBeNull();
  });

  it("changes nothing the second time", async () => {
    await backfillPictureCopies({ pictures, storage, dryRun: false });
    const before = await storage.get(keyOf(A, "w320"));

    const report = await backfillPictureCopies({ pictures, storage, dryRun: false });

    expect(report).toMatchObject({ copiesMade: 0, alreadyDone: 2, failed: [] });
    expect((await storage.get(keyOf(A, "w320")))?.bytes).toEqual(before?.bytes);
  });

  it("counts a picture whose file is gone, and carries on with the rest", async () => {
    const report = await backfillPictureCopies({ pictures: [{ id: GONE, storageKey: keyOf(GONE) }, ...pictures], storage, dryRun: false });

    expect(report.missingFiles).toEqual([GONE]);
    expect(report.copiesMade).toBe(3);
  });

  it("reports a picture it cannot decode and carries on", async () => {
    await storage.put(keyOf(GONE), new Uint8Array([1, 2, 3]), "image/webp");

    const report = await backfillPictureCopies({ pictures: [{ id: GONE, storageKey: keyOf(GONE) }, ...pictures], storage, dryRun: false });

    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]?.id).toBe(GONE);
    expect(report.copiesMade).toBe(3);
  });

  it("reports a report in words", () => {
    const text = formatBackfillReport({ pictures: 2, copiesMade: 3, alreadyDone: 0, missingFiles: [GONE], failed: [{ id: A, reason: "boom" }] }, true);
    expect(text).toContain("DRY RUN");
    expect(text).toContain("Copies that would be made: 3");
    expect(text).toContain(GONE);
    expect(text).toContain(`${A}: boom`);
  });
});
