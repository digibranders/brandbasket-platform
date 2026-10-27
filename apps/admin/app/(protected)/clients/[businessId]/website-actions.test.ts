import { PauseReasonInvalidError, ProjectCannotBePausedError, ProjectCannotStartBuildingError, ProjectNotPausedError } from "@brandbasket/db";
import { readFileSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { takePreviewPicture } from "@/lib/server/project-preview";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { loadWebsiteBuild } from "@/lib/server/website-build";
import { putOnHold, resumeBuilding, startBuilding } from "@/lib/server/website-moves";
import { putOnHoldAction, resumeBuildingAction, retakePreviewPictureAction, startBuildingAction } from "./website-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/website-build", () => ({ loadWebsiteBuild: vi.fn() }));
vi.mock("@/lib/server/project-preview", () => ({ takePreviewPicture: vi.fn() }));
vi.mock("@/lib/server/website-moves", () => ({ startBuilding: vi.fn(), putOnHold: vi.fn(), resumeBuilding: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const PROJECT = "01a0f71b-8402-7d48-a90a-207e8c8a8777";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;
const LOG = (action: string) => ({ staffUserId: "staff-1", action, targetType: "business", targetId: BUSINESS, businessId: BUSINESS });
const back = (notice: string) => `redirect:/clients/${BUSINESS}?build=${notice}#website-build`;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("startBuildingAction", () => {
  it("is refused for a session that is not staff's, before anything else", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(startBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(startBuilding).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id and moves nothing", async () => {
    await expect(startBuildingAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(startBuilding).not.toHaveBeenCalled();
  });

  it("starts building as the signed-in staff member, logs it, then returns to the section", async () => {
    const order: string[] = [];
    vi.mocked(startBuilding).mockImplementation(async () => void order.push("move"));
    vi.mocked(logStaffAccessOrThrow).mockImplementation(async () => void order.push("log"));
    vi.mocked(redirect).mockImplementation((url: string) => {
      order.push("redirect");
      throw new Error(`redirect:${url}`);
    });
    await expect(startBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("building"));
    expect(startBuilding).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1" }, expect.any(Date));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: BUSINESS, kind: "project.building" }));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(LOG("website.building"));
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
    expect(order).toEqual(["move", "log", "redirect"]);
  });

  it("answers not-allowed, without a log entry, when the project cannot start building", async () => {
    vi.mocked(startBuilding).mockRejectedValue(new ProjectCannotStartBuildingError(BUSINESS));
    await expect(startBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("not-allowed"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an unexpected error through", async () => {
    vi.mocked(startBuilding).mockRejectedValue(new Error("db down"));
    await expect(startBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lets an access log failure surface instead of redirecting", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(startBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("putOnHoldAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(putOnHoldAction(form({ businessId: BUSINESS, reason: "Waiting for the logo" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(putOnHold).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(putOnHoldAction(form({ businessId: "x", reason: "Waiting for the logo" }))).rejects.toThrow("must be a valid id");
    expect(putOnHold).not.toHaveBeenCalled();
  });

  it("puts the project on hold with the trimmed reason, logs it, then returns to the section", async () => {
    await expect(putOnHoldAction(form({ businessId: BUSINESS, reason: "  Waiting for the logo  " }))).rejects.toThrow(back("paused"));
    expect(putOnHold).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1", reason: "Waiting for the logo" }, expect.any(Date));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(LOG("website.hold"));
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("answers invalid, and calls nothing, when the reason does not parse", async () => {
    await expect(putOnHoldAction(form({ businessId: BUSINESS, reason: "ab" }))).rejects.toThrow(back("invalid"));
    await expect(putOnHoldAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("invalid"));
    expect(putOnHold).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("answers invalid when the database refuses the reason", async () => {
    vi.mocked(putOnHold).mockRejectedValue(new PauseReasonInvalidError());
    await expect(putOnHoldAction(form({ businessId: BUSINESS, reason: "Waiting for the logo" }))).rejects.toThrow(back("invalid"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("answers not-allowed when the project cannot be paused", async () => {
    vi.mocked(putOnHold).mockRejectedValue(new ProjectCannotBePausedError(BUSINESS));
    await expect(putOnHoldAction(form({ businessId: BUSINESS, reason: "Waiting for the logo" }))).rejects.toThrow(back("not-allowed"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure surface instead of redirecting", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(putOnHoldAction(form({ businessId: BUSINESS, reason: "Waiting for the logo" }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("resumeBuildingAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(resumeBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(resumeBuilding).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(resumeBuildingAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(resumeBuilding).not.toHaveBeenCalled();
  });

  it("resumes, logs it, then returns to the section", async () => {
    await expect(resumeBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("resumed"));
    expect(resumeBuilding).toHaveBeenCalledWith(DB, { businessId: BUSINESS, staffId: "staff-1" }, expect.any(Date));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(LOG("website.resume"));
  });

  it("answers not-allowed when the project is not paused", async () => {
    vi.mocked(resumeBuilding).mockRejectedValue(new ProjectNotPausedError(BUSINESS));
    await expect(resumeBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("not-allowed"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure surface instead of redirecting", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(resumeBuildingAction(form({ businessId: BUSINESS }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("retakePreviewPictureAction", () => {
  const project = { id: PROJECT, previewUrl: "https://preview.example.com/site" };

  beforeEach(() => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project, picture: null } as never);
  });

  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(retakePreviewPictureAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(takePreviewPicture).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(retakePreviewPictureAction(form({ businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(loadWebsiteBuild).not.toHaveBeenCalled();
  });

  it("takes the picture of this business's current preview link, logs it, then says so", async () => {
    vi.mocked(takePreviewPicture).mockResolvedValue(true);
    await expect(retakePreviewPictureAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("picture-taken"));
    expect(loadWebsiteBuild).toHaveBeenCalledWith(BUSINESS, "staff-1");
    expect(takePreviewPicture).toHaveBeenCalledWith(DB, { projectId: PROJECT, businessId: BUSINESS, previewUrl: "https://preview.example.com/site" });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(LOG("website.picture"));
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("says the picture failed, and still logs the attempt, when the capture fails", async () => {
    vi.mocked(takePreviewPicture).mockResolvedValue(false);
    await expect(retakePreviewPictureAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("picture-failed"));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(LOG("website.picture"));
  });

  it("refuses, without a capture, when the project has no preview link or there is no project", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: { ...project, previewUrl: null }, picture: null } as never);
    await expect(retakePreviewPictureAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("picture-failed"));
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: null, picture: null });
    await expect(retakePreviewPictureAction(form({ businessId: BUSINESS }))).rejects.toThrow(back("picture-failed"));
    expect(takePreviewPicture).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure surface instead of redirecting", async () => {
    vi.mocked(takePreviewPicture).mockResolvedValue(true);
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(retakePreviewPictureAction(form({ businessId: BUSINESS }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("the action file", () => {
  it("imports the staff guard and has no customer-session import", () => {
    const source = readFileSync(new URL("./website-actions.ts", import.meta.url), "utf8");
    expect(source).toContain('from "@/lib/server/staff-access"');
    expect(source).not.toMatch(/session|getAppDb/i);
  });
});
