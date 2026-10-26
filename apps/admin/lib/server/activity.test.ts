import { recordActivity } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import type { GrantedStaff } from "@/lib/server/staff-access";
import { recordStaffAction } from "./activity";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ recordActivity: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(DB);
});

describe("recordStaffAction", () => {
  it("writes one staff row with the signed-in member as the actor", async () => {
    await recordStaffAction(STAFF, { businessId: BUSINESS, kind: "project.preview_sent", summary: "Sent the preview", data: { notified: "emailed" } });
    expect(recordActivity).toHaveBeenCalledWith(DB, {
      businessId: BUSINESS,
      actorKind: "staff",
      actorId: "staff-1",
      kind: "project.preview_sent",
      summary: "Sent the preview",
      data: { notified: "emailed" },
      visibleToClient: undefined,
    });
  });

  it("never throws when the row cannot be written, and logs the kind without the summary", async () => {
    vi.mocked(recordActivity).mockRejectedValue(new Error("database down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordStaffAction(STAFF, { businessId: null, kind: "pricing.saved", summary: "Saved prices" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("A staff action could not be recorded.", expect.objectContaining({ kind: "pricing.saved" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("Saved prices");
    log.mockRestore();
  });
});
