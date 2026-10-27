import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookTeamCall, callsAreOpen, cancelTeamCallFor } from "@/lib/server/calls";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";
import { bookCallAction, cancelCallAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/first-look", () => ({ loadSetupServices: vi.fn() }));
vi.mock("@/lib/server/calls", () => ({ bookTeamCall: vi.fn(), callsAreOpen: vi.fn(), cancelTeamCallFor: vi.fn() }));

const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: null };
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" };
const billing = { hasAccess: true, hasWebsite: true };
const START = "2026-12-02T08:30:00.000Z";
const GOOD = { startIso: START, timeZone: "Asia/Kolkata", reason: "social", note: "  Ads for braces  " };
const CALL = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user, tenant, billing } as never);
  vi.mocked(callsAreOpen).mockResolvedValue(true);
  vi.mocked(loadSetupServices).mockResolvedValue(["website", "social"]);
  vi.mocked(bookTeamCall).mockResolvedValue({ ok: true, startsAtIso: START, endsAtIso: "2026-12-02T09:00:00.000Z" });
  vi.mocked(cancelTeamCallFor).mockResolvedValue({ ok: true });
});

describe("bookCallAction", () => {
  it("books for the signed-in person's own business, whatever else the browser sends", async () => {
    const result = await bookCallAction({ ...GOOD, businessId: "someone-elses", userId: "someone-else", email: "x@example.com" });
    expect(result).toEqual({ ok: true });
    expect(bookTeamCall).toHaveBeenCalledWith(tenant, { name: "Priya Shah", email: "priya@example.com" }, { startIso: START, timeZone: "Asia/Kolkata", reason: "social", note: "Ads for braces", replaceId: null }, expect.any(Date));
    expect(revalidatePath).toHaveBeenCalledWith("/requests/calls");
  });

  it("passes on the call being changed", async () => {
    await bookCallAction({ ...GOOD, replaceId: CALL });
    expect(bookTeamCall).toHaveBeenCalledWith(tenant, expect.anything(), expect.objectContaining({ replaceId: CALL }), expect.any(Date));
  });

  it("refuses a service the customer has not bought, with the sentence the sheet shows", async () => {
    expect(await bookCallAction({ ...GOOD, reason: "search" })).toEqual({ ok: false, reason: "invalid", message: "Choose what the call is about." });
    expect(bookTeamCall).not.toHaveBeenCalled();
  });

  it("refuses a note that is too long", async () => {
    expect(await bookCallAction({ ...GOOD, note: "x".repeat(501) })).toEqual({ ok: false, reason: "invalid", message: "Keep the note to 500 characters or fewer." });
  });

  it("refuses what is not a booking at all, or a call to change that is not an id", async () => {
    expect(await bookCallAction(null)).toEqual({ ok: false, reason: "failed" });
    expect(await bookCallAction({ ...GOOD, startIso: 5 })).toEqual({ ok: false, reason: "failed" });
    expect(await bookCallAction({ ...GOOD, replaceId: "call-1" })).toEqual({ ok: false, reason: "failed" });
    expect(bookTeamCall).not.toHaveBeenCalled();
  });

  it("books nothing for an account without a real email address, or while calls are closed", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { ...user, email: "919876543210@phone.brandbasket.invalid" }, tenant, billing } as never);
    expect(await bookCallAction(GOOD)).toEqual({ ok: false, reason: "failed" });
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user, tenant, billing } as never);
    vi.mocked(callsAreOpen).mockResolvedValue(false);
    expect(await bookCallAction(GOOD)).toEqual({ ok: false, reason: "failed" });
    expect(bookTeamCall).not.toHaveBeenCalled();
  });

  it("hands back why a booking did not happen, and refreshes nothing", async () => {
    vi.mocked(bookTeamCall).mockResolvedValue({ ok: false, reason: "limit" });
    expect(await bookCallAction(GOOD)).toEqual({ ok: false, reason: "limit" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("cancelCallAction", () => {
  it("cancels one of the signed-in business's calls and refreshes the pages that show it", async () => {
    expect(await cancelCallAction(CALL)).toEqual({ ok: true });
    expect(cancelTeamCallFor).toHaveBeenCalledWith(tenant, CALL, expect.any(Date));
    expect(revalidatePath).toHaveBeenCalledWith("/requests/calls");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refuses an id that is not an id, and cancels nothing while calls are closed", async () => {
    expect(await cancelCallAction("call-1")).toEqual({ ok: false, reason: "failed" });
    vi.mocked(callsAreOpen).mockResolvedValue(false);
    expect(await cancelCallAction(CALL)).toEqual({ ok: false, reason: "failed" });
    expect(cancelTeamCallFor).not.toHaveBeenCalled();
  });

  it("hands back gone or failed as they are", async () => {
    vi.mocked(cancelTeamCallFor).mockResolvedValue({ ok: false, reason: "gone" });
    expect(await cancelCallAction(CALL)).toEqual({ ok: false, reason: "gone" });
    expect(revalidatePath).toHaveBeenCalledWith("/requests/calls");
  });
});
