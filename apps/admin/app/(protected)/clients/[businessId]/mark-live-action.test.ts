import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { launchProject, ProjectLaunchAddressUnverifiedError } from "@/lib/server/project-launch";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { markLiveAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
// The page's other actions' server modules: not under test here, and they reach for the environment when loaded.
vi.mock("@/lib/server/add-ons-admin", () => ({}));
vi.mock("@/lib/server/billing-admin", () => ({}));
vi.mock("@/lib/server/charges-admin", () => ({}));
vi.mock("@/lib/server/chatbots-admin", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/domain-ready", () => ({}));
vi.mock("@/lib/server/domain-switch", () => ({}));
vi.mock("@/lib/server/project-preview", () => ({}));
vi.mock("@/lib/server/site-check", () => ({}));
vi.mock("@/lib/server/site-token", () => ({}));
vi.mock("@/lib/server/web-address", () => ({}));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/project-launch", () => {
  class ProjectLaunchAddressUnverifiedError extends Error {}
  class Unused extends Error {}
  return {
    launchProject: vi.fn(),
    ProjectLaunchAddressUnverifiedError,
    ProjectLaunchChecksMissingError: Unused,
    ProjectLaunchDomainMissingError: Unused,
    ProjectLaunchRecipientMissingError: Unused,
  };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "admin" } } as unknown as GrantedStaff;
const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;

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

describe("markLiveAction address check", () => {
  it("sends staff back with the warning when the address does not load, and records nothing", async () => {
    vi.mocked(launchProject).mockRejectedValue(new ProjectLaunchAddressUnverifiedError(BUSINESS, "dns"));
    await expect(markLiveAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?launch=address-unverified`);
    expect(launchProject).toHaveBeenCalledWith(DB, { businessId: BUSINESS, confirmUnverifiedAddress: false }, expect.any(Date));
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("passes the confirmation on and records that staff confirmed it", async () => {
    vi.mocked(launchProject).mockResolvedValue("emailed");
    await expect(markLiveAction(form({ businessId: BUSINESS, confirmUnverifiedAddress: "yes" }))).rejects.toThrow(
      `redirect:/clients/${BUSINESS}/website?launch=launched`,
    );
    expect(launchProject).toHaveBeenCalledWith(DB, { businessId: BUSINESS, confirmUnverifiedAddress: true }, expect.any(Date));
    expect(recordStaffAction).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ kind: "project.marked_live", data: { notified: "emailed", addressConfirmedByStaff: true } }),
    );
  });
});
