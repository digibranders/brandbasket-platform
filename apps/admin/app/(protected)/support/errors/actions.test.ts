import { getErrorIssue, updateErrorIssueStatus } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { setErrorStatusAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ getErrorIssue: vi.fn(), updateErrorIssueStatus: vi.fn() }));

const ID = "0198f2c0-0000-7000-8000-0000000000aa";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue({} as Awaited<ReturnType<typeof requireStaffAccess>>);
});

describe("setErrorStatusAction", () => {
  it("checks access, changes only the status, and returns the previous status for Undo", async () => {
    vi.mocked(getErrorIssue).mockResolvedValue({ status: "new" } as Awaited<ReturnType<typeof getErrorIssue>>);
    vi.mocked(updateErrorIssueStatus).mockResolvedValue(true);
    expect(await setErrorStatusAction(ID, "resolved", 4)).toEqual({ ok: true, previous: "new", occurrenceCount: 4 });
    expect(requireStaffAccess).toHaveBeenCalled();
    expect(updateErrorIssueStatus).toHaveBeenCalledWith(expect.anything(), ID, "resolved", 4);
  });

  it("says so when a newer occurrence arrived", async () => {
    vi.mocked(getErrorIssue).mockResolvedValue({ status: "new" } as Awaited<ReturnType<typeof getErrorIssue>>);
    vi.mocked(updateErrorIssueStatus).mockResolvedValue(false);
    expect(await setErrorStatusAction(ID, "ignored", 4)).toMatchObject({ ok: false });
  });

  it("refuses an unknown status or id without reading the database", async () => {
    expect(await setErrorStatusAction(ID, "deleted", 4)).toMatchObject({ ok: false });
    expect(await setErrorStatusAction("nope", "new", 4)).toMatchObject({ ok: false });
    expect(getErrorIssue).not.toHaveBeenCalled();
  });

  it("answers a missing error", async () => {
    vi.mocked(getErrorIssue).mockResolvedValue(null);
    expect(await setErrorStatusAction(ID, "new", 1)).toEqual({ ok: false, message: "That error no longer exists." });
  });
});
