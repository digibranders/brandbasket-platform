import { listFeedbackForProject, listPreviewVersions } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPreviewVersions, loadSentChanges } from "./preview-versions";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ kind: "staff-db" })) }));
vi.mock("@brandbasket/db", () => ({ listFeedbackForProject: vi.fn(), listPreviewVersions: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" } as never;
const SENT = new Date("2026-11-02T10:27:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadPreviewVersions", () => {
  it("asks for the session's business and the given project on the staff connection, and keeps the order it gets", async () => {
    vi.mocked(listPreviewVersions).mockResolvedValue([
      { version: 2, previewUrl: "https://two.example", sentAt: SENT, sentByStaffId: "staff-1" },
      { version: 1, previewUrl: "https://one.example", sentAt: new Date("2026-11-01T10:27:00.000Z"), sentByStaffId: null },
    ]);
    const versions = await loadPreviewVersions(tenant, "project-1");
    expect(listPreviewVersions).toHaveBeenCalledWith({ kind: "staff-db" }, { projectId: "project-1", businessId: "business-1" });
    expect(versions.map((item) => item.version)).toEqual([2, 1]);
  });

  it("returns only the number, the link and the time, never who sent it", async () => {
    vi.mocked(listPreviewVersions).mockResolvedValue([{ version: 1, previewUrl: "https://one.example", sentAt: SENT, sentByStaffId: "staff-1" }]);
    expect(await loadPreviewVersions(tenant, "project-1")).toEqual([{ version: 1, url: "https://one.example", sentAt: SENT }]);
  });
});

describe("loadSentChanges", () => {
  it("asks for the session's business and the given project, and returns only what the page draws", async () => {
    vi.mocked(listFeedbackForProject).mockResolvedValue([
      { ticketId: "ticket-1", displayRef: "REQ-1", subject: "Preview feedback", body: "Update the hero heading", status: "open", round: 1, createdAt: SENT },
    ] as never);
    expect(await loadSentChanges(tenant, "project-1")).toEqual([{ ticketId: "ticket-1", round: 1, body: "Update the hero heading", sentAt: SENT }]);
    expect(listFeedbackForProject).toHaveBeenCalledWith({ kind: "staff-db" }, { projectId: "project-1", businessId: "business-1" });
  });
});
