import { detachGoogle, provisionGoogleAgain, retryGoogleVerification } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { detachGoogleAction, provisionGoogleAction, retryGoogleVerificationAction } from "./google-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT ${href}`);
  }),
}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, retryGoogleVerification: vi.fn(), detachGoogle: vi.fn(), provisionGoogleAgain: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const DB = { db: true } as never;
const staffWith = (role: string) => ({ user: { id: "staff-1" }, staff: { userId: "staff-1", role } }) as unknown as GrantedStaff;
const HREF = (notice: string) => `NEXT_REDIRECT /clients/${BUSINESS}/website?google=${notice}#google`;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(staffWith("admin"));
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(retryGoogleVerification).mockResolvedValue(true);
  vi.mocked(detachGoogle).mockResolvedValue(2);
  vi.mocked(provisionGoogleAgain).mockResolvedValue(2);
});

const ACTIONS = [
  ["retry", retryGoogleVerificationAction, retryGoogleVerification],
  ["detach", detachGoogleAction, detachGoogle],
  ["provision", provisionGoogleAction, provisionGoogleAgain],
] as const;

describe.each(ACTIONS)("%s action access", (_name, action, query) => {
  it("is refused for a session that is not staff's, before anything is written", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    await expect(action(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(query).not.toHaveBeenCalled();
  });

  it("sends support staff away and logs the refusal, before anything is written", async () => {
    vi.mocked(requireStaffAccess).mockResolvedValue(staffWith("support"));
    await expect(action(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow("NEXT_REDIRECT /no-access");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "access.denied", targetType: "google", result: "denied" });
    expect(query).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it.each(["admin", "finance"])("lets %s act", async (role) => {
    vi.mocked(requireStaffAccess).mockResolvedValue(staffWith(role));
    await expect(action(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow("NEXT_REDIRECT /clients/");
    expect(query).toHaveBeenCalledWith(DB, BUSINESS, expect.any(Date));
  });

  it("throws on a form that does not name a business", async () => {
    await expect(action(form({ businessId: "not-an-id", confirm: "yes" }))).rejects.toThrow("valid id");
    expect(query).not.toHaveBeenCalled();
  });
});

describe("retryGoogleVerificationAction", () => {
  it("asks again, records it without naming anything private, and answers with the notice", async () => {
    await expect(retryGoogleVerificationAction(form({ businessId: BUSINESS }))).rejects.toThrow(HREF("retry-asked"));
    expect(recordStaffAction).toHaveBeenCalledWith(expect.anything(), { businessId: BUSINESS, kind: "google.verification_retried", summary: "Asked the go-live job to check Google verification again", visibleToClient: false });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}/website`);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("says so and records nothing when there was no unverified site", async () => {
    vi.mocked(retryGoogleVerification).mockResolvedValue(false);
    await expect(retryGoogleVerificationAction(form({ businessId: BUSINESS }))).rejects.toThrow(HREF("retry-nothing"));
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

describe("detachGoogleAction", () => {
  it("changes nothing without the ticked confirmation", async () => {
    await expect(detachGoogleAction(form({ businessId: BUSINESS }))).rejects.toThrow(HREF("detach-confirm"));
    await expect(detachGoogleAction(form({ businessId: BUSINESS, confirm: "on" }))).rejects.toThrow(HREF("detach-confirm"));
    expect(detachGoogle).not.toHaveBeenCalled();
  });

  it("detaches, records it and answers with the notice", async () => {
    await expect(detachGoogleAction(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow(HREF("detached"));
    expect(recordStaffAction).toHaveBeenCalledWith(expect.anything(), { businessId: BUSINESS, kind: "google.detached", summary: "Detached the client from Google", visibleToClient: false });
  });

  it("says so when nothing was attached", async () => {
    vi.mocked(detachGoogle).mockResolvedValue(0);
    await expect(detachGoogleAction(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow(HREF("detach-nothing"));
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

describe("provisionGoogleAction", () => {
  it("puts a detached client back, records it and answers with the notice", async () => {
    await expect(provisionGoogleAction(form({ businessId: BUSINESS }))).rejects.toThrow(HREF("provisioned"));
    expect(recordStaffAction).toHaveBeenCalledWith(expect.anything(), { businessId: BUSINESS, kind: "google.provisioned", summary: "Put the client back in the go-live queue for Google", visibleToClient: false });
  });

  it("says so when the client was not detached", async () => {
    vi.mocked(provisionGoogleAgain).mockResolvedValue(0);
    await expect(provisionGoogleAction(form({ businessId: BUSINESS }))).rejects.toThrow(HREF("provision-nothing"));
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});
