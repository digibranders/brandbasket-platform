import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@firstfold/db";
import type { SupportStorage } from "@firstfold/shared/server/support-storage";

vi.mock("server-only", () => ({}));
const claimExpiredSupportAttachments = vi.fn(async () => undefined);
const listDeletingSupportAttachments = vi.fn(async (): Promise<{ id: string; storageKey: string }[]> => []);
const markSupportAttachmentPurged = vi.fn(async () => undefined);
const claimSupportTicketsDueRetention = vi.fn(async () => ({ ticketIds: [] as string[], attachments: [] as never[] }));
const finalizeSupportTicketRetention = vi.fn(async () => 0);
const purgeErrorIssues = vi.fn(async () => 0);
vi.mock("@firstfold/db", () => ({
  claimExpiredSupportAttachments,
  listDeletingSupportAttachments,
  markSupportAttachmentPurged,
  claimSupportTicketsDueRetention,
  finalizeSupportTicketRetention,
  purgeErrorIssues,
}));

const { maintainSupportAttachments, runSupportMaintenance } = await import("./support-attachment-maintenance");

const db = {} as Database;
const storage = { delete: vi.fn(async () => undefined) } as unknown as SupportStorage;
const now = new Date("2026-10-10T00:00:00Z");

describe("runSupportMaintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purgeErrorIssues.mockResolvedValue(0);
    listDeletingSupportAttachments.mockResolvedValue([]);
  });

  it("removes expired screenshots and expired resolved error issues in one run", async () => {
    listDeletingSupportAttachments.mockResolvedValueOnce([{ id: "a", storageKey: "support/u/a" }]);
    purgeErrorIssues.mockResolvedValueOnce(3);
    const result = await runSupportMaintenance(db, storage, now, 100, null);
    expect(claimExpiredSupportAttachments).toHaveBeenCalledWith(db, now, 100);
    expect(purgeErrorIssues).toHaveBeenCalledWith(db, now, 100);
    expect(result).toEqual({ purged: 1, failed: 0, ticketsPurged: 0, errorIssuesPurged: 3 });
  });

  it("keeps purging error issues in full batches and stops at a short batch", async () => {
    purgeErrorIssues.mockResolvedValueOnce(100).mockResolvedValueOnce(100).mockResolvedValueOnce(7);
    const result = await runSupportMaintenance(db, storage, now, 100, null);
    expect(purgeErrorIssues).toHaveBeenCalledTimes(3);
    expect(result.errorIssuesPurged).toBe(207);
  });

  it("purges no closed ticket when retention is off", async () => {
    await runSupportMaintenance(db, storage, now, 100, null);
    expect(claimSupportTicketsDueRetention).not.toHaveBeenCalled();
  });

  it("claims closed tickets older than the configured months when retention is on", async () => {
    await runSupportMaintenance(db, storage, now, 100, 6);
    expect(claimSupportTicketsDueRetention).toHaveBeenCalledWith(db, new Date("2026-04-10T00:00:00Z"), 100);
  });

  it("still cleans screenshots when the error issue purge fails, then reports the failure", async () => {
    purgeErrorIssues.mockRejectedValueOnce(new Error("timeout"));
    listDeletingSupportAttachments.mockResolvedValueOnce([{ id: "a", storageKey: "support/u/a" }]);
    await expect(runSupportMaintenance(db, storage, now, 100, null)).rejects.toThrow("Automatic error cleanup failed");
    expect(markSupportAttachmentPurged).toHaveBeenCalledTimes(1);
  });

  it("still purges error issues when the screenshot pass throws, then reports the failure", async () => {
    claimExpiredSupportAttachments.mockRejectedValueOnce(new Error("db down"));
    await expect(runSupportMaintenance(db, storage, now, 100, null)).rejects.toThrow("Support screenshot cleanup failed");
    expect(purgeErrorIssues).toHaveBeenCalledTimes(1);
  });
});

describe("maintainSupportAttachments", () => {
  it("rejects a batch size outside 1 to 1000", async () => {
    await expect(maintainSupportAttachments(db, storage, now, 0, null)).rejects.toThrow(RangeError);
  });
});
