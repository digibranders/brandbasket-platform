import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { saveRevisionRounds } from "@/lib/server/settings-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { saveRevisionRoundsAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/settings-admin", () => ({ saveSetupCallUrl: vi.fn(), saveRevisionRounds: vi.fn() }));
vi.mock("@/lib/server/teams-admin", () => ({ saveTeamsUrl: vi.fn(), removeTeamsUrl: vi.fn(), testTeamsUrl: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

// requireStaffCan is real here: the point is that the role check, not a mock of it, keeps support and finance out.
function signedInAs(role: "support" | "finance" | "admin"): void {
  vi.mocked(requireStaffAccess).mockResolvedValue({ user: { id: "staff-1", email: "owner@example.com" }, staff: { userId: "staff-1", role } } as never);
}

function form(value: string | null): FormData {
  const data = new FormData();
  if (value !== null) data.set("revisionRounds", value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("saveRevisionRoundsAction", () => {
  it("saves the number for an admin, records who changed it, and says so", async () => {
    signedInAs("admin");
    await expect(saveRevisionRoundsAction(form("3"))).rejects.toThrow("redirect:/settings?saved=rounds-saved#revision-rounds");
    expect(saveRevisionRounds).toHaveBeenCalledWith({ rounds: 3, staffUserId: "staff-1" }, expect.any(Date));
    expect(recordStaffAction).toHaveBeenCalledWith(expect.anything(), {
      businessId: null,
      kind: "settings.revision_rounds_saved",
      summary: "Set the rounds of changes in a new build to 3",
      data: { rounds: 3 },
    });
  });

  it("accepts the two ends of the range", async () => {
    signedInAs("admin");
    await expect(saveRevisionRoundsAction(form("0"))).rejects.toThrow("rounds-saved");
    await expect(saveRevisionRoundsAction(form("10"))).rejects.toThrow("rounds-saved");
    expect(saveRevisionRounds).toHaveBeenCalledTimes(2);
  });

  it.each(["support", "finance"] as const)("sends %s to the no-access page and saves and records nothing", async (role) => {
    signedInAs(role);
    await expect(saveRevisionRoundsAction(form("5"))).rejects.toThrow("redirect:/no-access");
    expect(saveRevisionRounds).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it.each(["", "11", "-1", "2.5", "many"])("refuses %j from an admin, whatever the form allowed", async (typed) => {
    signedInAs("admin");
    await expect(saveRevisionRoundsAction(form(typed))).rejects.toThrow("redirect:/settings?saved=rounds-invalid#revision-rounds");
    expect(saveRevisionRounds).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("refuses a form with no number at all", async () => {
    signedInAs("admin");
    await expect(saveRevisionRoundsAction(form(null))).rejects.toThrow("rounds-invalid");
    expect(saveRevisionRounds).not.toHaveBeenCalled();
  });
});
