import {
  assignProjectBuilder,
  cancelProject,
  grantRevisionRound,
  ProjectBuilderNotStaffError,
  ProjectMoveRefusedError,
  setProjectLaunchPlannedOn,
} from "@brandbasket/db";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import {
  assignBuilderAction,
  cancelProjectAction,
  grantRoundAction,
  planLaunchAction,
} from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    cancelProject: vi.fn(),
    assignProjectBuilder: vi.fn(),
    grantRevisionRound: vi.fn(),
    setProjectLaunchPlannedOn: vi.fn(),
  };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const BUSINESS = "0198f2c0-0000-7000-8000-0000000000b1";
const PROJECT = "0198f2c0-0000-7000-8000-0000000000a1";
const MOVED = { id: PROJECT, businessId: BUSINESS, status: "building" as const };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const IDS = { businessId: BUSINESS, projectId: PROJECT };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("cancelProjectAction", () => {
  it("refuses without the confirm box", async () => {
    await expect(cancelProjectAction(form(IDS))).rejects.toThrow("move=confirm-missing");
    expect(cancelProject).not.toHaveBeenCalled();
  });

  it("cancels with the box ticked, and keeps it off the client's activity", async () => {
    vi.mocked(cancelProject).mockResolvedValue({ ...MOVED, status: "cancelled" });
    await expect(cancelProjectAction(form({ ...IDS, confirm: "yes" }))).rejects.toThrow("move=cancelled");
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "project.cancelled", visibleToClient: false }));
  });
});

describe("a form whose business and project do not match", () => {
  it("logs and redirects with the business the move really changed", async () => {
    const OTHER = "0198f2c0-0000-7000-8000-0000000000b2";
    vi.mocked(cancelProject).mockResolvedValue({ ...MOVED, status: "cancelled" });
    await expect(cancelProjectAction(form({ businessId: OTHER, projectId: PROJECT, confirm: "yes" }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/project?move=cancelled`);
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: BUSINESS, kind: "project.cancelled" }));
  });
});

describe("assignBuilderAction", () => {
  it("saves a builder, and clears it when none is picked", async () => {
    vi.mocked(assignProjectBuilder).mockResolvedValue(MOVED);
    await expect(assignBuilderAction(form({ ...IDS, builder: "staff-2" }))).rejects.toThrow("move=assigned");
    expect(assignProjectBuilder).toHaveBeenCalledWith(DB, PROJECT, "staff-2");

    await expect(assignBuilderAction(form({ ...IDS, builder: "" }))).rejects.toThrow("move=assigned");
    expect(assignProjectBuilder).toHaveBeenLastCalledWith(DB, PROJECT, null);
  });

  it("says so when the person is not active staff", async () => {
    vi.mocked(assignProjectBuilder).mockRejectedValue(new ProjectBuilderNotStaffError("x"));
    await expect(assignBuilderAction(form({ ...IDS, builder: "x" }))).rejects.toThrow("move=not-staff");
  });
});

describe("grantRoundAction", () => {
  it("adds a round and tells the client", async () => {
    vi.mocked(grantRevisionRound).mockResolvedValue({ ...MOVED, status: "revisions" });
    await expect(grantRoundAction(form(IDS))).rejects.toThrow("move=round-added");
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "project.round_added", visibleToClient: true }));
  });
});

describe("ids", () => {
  it("refuses a business id that is not a uuid", async () => {
    await expect(cancelProjectAction(form({ businessId: "nope", projectId: PROJECT }))).rejects.toThrow("must be a valid id");
  });
});

describe("planLaunchAction", () => {
  it("saves the day, records it for the team and says it is saved", async () => {
    vi.mocked(setProjectLaunchPlannedOn).mockResolvedValue(MOVED);
    await expect(planLaunchAction(form({ ...IDS, launchDay: "2026-12-05" }))).rejects.toThrow("move=launch-planned");
    expect(setProjectLaunchPlannedOn).toHaveBeenCalledWith(DB, PROJECT, "2026-12-05");
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: BUSINESS, kind: "project.launch_planned", summary: "Launch day set" }));
  });

  it("clears the day when the field is empty", async () => {
    vi.mocked(setProjectLaunchPlannedOn).mockResolvedValue(MOVED);
    await expect(planLaunchAction(form({ ...IDS, launchDay: "  " }))).rejects.toThrow("move=launch-planned");
    expect(setProjectLaunchPlannedOn).toHaveBeenCalledWith(DB, PROJECT, null);
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ summary: "Launch day cleared" }));
  });

  it("refuses text that is not a day, without touching the database", async () => {
    await expect(planLaunchAction(form({ ...IDS, launchDay: "next week" }))).rejects.toThrow("move=launch-day-invalid");
    expect(setProjectLaunchPlannedOn).not.toHaveBeenCalled();
  });

  it("says the build no longer allows it when the database refuses", async () => {
    vi.mocked(setProjectLaunchPlannedOn).mockRejectedValue(new ProjectMoveRefusedError("plan-launch", PROJECT));
    await expect(planLaunchAction(form({ ...IDS, launchDay: "2026-12-05" }))).rejects.toThrow("move=refused");
  });
});
