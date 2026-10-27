import {
  assignProjectBuilder,
  cancelProject,
  grantRevisionRound,
  ProjectBuilderNotStaffError,
  ProjectMoveRefusedError,
  putProjectOnHold,
  resumeProject,
  setProjectBuilding,
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
  holdProjectAction,
  resumeProjectAction,
  startBuildingAction,
} from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    setProjectBuilding: vi.fn(),
    putProjectOnHold: vi.fn(),
    resumeProject: vi.fn(),
    cancelProject: vi.fn(),
    assignProjectBuilder: vi.fn(),
    grantRevisionRound: vi.fn(),
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

describe("startBuildingAction", () => {
  it("moves the build, records it for the client, and says so", async () => {
    vi.mocked(setProjectBuilding).mockResolvedValue(MOVED);
    await expect(startBuildingAction(form(IDS))).rejects.toThrow(`redirect:/clients/${BUSINESS}/project?move=building`);
    expect(setProjectBuilding).toHaveBeenCalledWith(DB, PROJECT);
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: BUSINESS, kind: "project.building", visibleToClient: true }));
  });

  it("says nothing changed when the database refuses the move", async () => {
    vi.mocked(setProjectBuilding).mockRejectedValue(new ProjectMoveRefusedError("start-building", PROJECT));
    await expect(startBuildingAction(form(IDS))).rejects.toThrow("move=refused");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

describe("holdProjectAction", () => {
  it("asks for a reason before touching the build", async () => {
    await expect(holdProjectAction(form({ ...IDS, reason: "   " }))).rejects.toThrow("move=reason-missing");
    expect(putProjectOnHold).not.toHaveBeenCalled();
  });

  it("holds with the trimmed reason and records it for the client", async () => {
    vi.mocked(putProjectOnHold).mockResolvedValue({ ...MOVED, status: "on_hold" });
    await expect(holdProjectAction(form({ ...IDS, reason: " Waiting for photos " }))).rejects.toThrow("move=held");
    expect(putProjectOnHold).toHaveBeenCalledWith(DB, PROJECT, "Waiting for photos");
    expect(recordStaffAction).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ kind: "project.put_on_hold", summary: "Put on hold: Waiting for photos", visibleToClient: true }),
    );
  });
});

describe("resumeProjectAction", () => {
  it("resumes the build", async () => {
    vi.mocked(resumeProject).mockResolvedValue(MOVED);
    await expect(resumeProjectAction(form(IDS))).rejects.toThrow("move=resumed");
    expect(resumeProject).toHaveBeenCalledWith(DB, PROJECT);
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
    await expect(startBuildingAction(form({ businessId: "nope", projectId: PROJECT }))).rejects.toThrow("must be a valid id");
  });
});
