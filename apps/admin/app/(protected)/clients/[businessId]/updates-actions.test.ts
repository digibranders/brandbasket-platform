import { addActivityEvent, removeActivityEvent } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { addUpdateAction, removeUpdateAction } from "./updates-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, addActivityEvent: vi.fn(), removeActivityEvent: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const EVENT = "01a0f71b-8402-7d48-a90a-207e8c8a8999";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;

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

describe("addUpdateAction", () => {
  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(addUpdateAction(form({ businessId: BUSINESS, title: "Fixed the menu page" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(addActivityEvent).not.toHaveBeenCalled();
  });

  it("adds the update as the signed-in staff member, logs it and returns to the section", async () => {
    await expect(
      addUpdateAction(form({ businessId: BUSINESS, service: "website", title: "  Fixed the menu page ", date: "2026-10-20" })),
    ).rejects.toThrow(`redirect:/clients/${BUSINESS}?updates=added#updates`);
    expect(addActivityEvent).toHaveBeenCalledWith(DB, {
      businessId: BUSINESS,
      service: "website",
      title: "Fixed the menu page",
      occurredAt: new Date("2026-10-20T12:00:00+05:30"),
      staffId: "staff-1",
    });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "activity.add",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("stores a general update (no service) and defaults the date to today in India", async () => {
    await expect(addUpdateAction(form({ businessId: BUSINESS, service: "", title: "Monthly check done", date: "" }))).rejects.toThrow("?updates=added");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    expect(addActivityEvent).toHaveBeenCalledWith(DB, expect.objectContaining({ service: null, occurredAt: new Date(`${today}T12:00:00+05:30`) }));
  });

  it("calls nothing and redirects with invalid when the form is not valid", async () => {
    await expect(addUpdateAction(form({ businessId: BUSINESS, service: "", title: "ab", date: "" }))).rejects.toThrow(
      `redirect:/clients/${BUSINESS}?updates=invalid#updates`,
    );
    expect(addActivityEvent).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("throws on a business id that is not an id", async () => {
    await expect(addUpdateAction(form({ businessId: "x", title: "Fixed the menu page" }))).rejects.toThrow("must be a valid id");
    expect(addActivityEvent).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate, so an unlogged action does not look successful", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(addUpdateAction(form({ businessId: BUSINESS, title: "Fixed the menu page" }))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("removeUpdateAction", () => {
  it("removes the update only within the given business, logs it and returns to the section", async () => {
    vi.mocked(removeActivityEvent).mockResolvedValue(true);
    await expect(removeUpdateAction(form({ id: EVENT, businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?updates=removed#updates`);
    expect(removeActivityEvent).toHaveBeenCalledWith(DB, { id: EVENT, businessId: BUSINESS });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "activity.remove",
      targetType: "business",
      targetId: BUSINESS,
      businessId: BUSINESS,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("throws on an update id or a business id that is not an id", async () => {
    await expect(removeUpdateAction(form({ id: "x", businessId: BUSINESS }))).rejects.toThrow("must be a valid id");
    await expect(removeUpdateAction(form({ id: EVENT, businessId: "x" }))).rejects.toThrow("must be a valid id");
    expect(removeActivityEvent).not.toHaveBeenCalled();
  });

  it("writes no log entry, and still returns to the section, when the update was already gone", async () => {
    vi.mocked(removeActivityEvent).mockResolvedValue(false);
    await expect(removeUpdateAction(form({ id: EVENT, businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?updates=removed#updates`);
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("lets an access log failure propagate", async () => {
    vi.mocked(removeActivityEvent).mockResolvedValue(true);
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(removeUpdateAction(form({ id: EVENT, businessId: BUSINESS }))).rejects.toThrow("log down");
  });
});
