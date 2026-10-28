import { ensureSiteKey } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { createSiteKeyAction } from "./tracking-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, ensureSiteKey: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
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
});

describe("createSiteKeyAction", () => {
  it("is refused for a session that is not staff's, before anything is written", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(createSiteKeyAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(ensureSiteKey).not.toHaveBeenCalled();
  });

  it("makes the business's key, records who did it without the key in the record, and refreshes the client's pages", async () => {
    await createSiteKeyAction(form({ businessId: BUSINESS }));
    expect(ensureSiteKey).toHaveBeenCalledWith(DB, BUSINESS);
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: BUSINESS, kind: "website.tracking_key_created", summary: "Created the site tracking key" });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("throws on a form that does not name a business", async () => {
    await expect(createSiteKeyAction(form({ businessId: "not-an-id" }))).rejects.toThrow("valid id");
    expect(ensureSiteKey).not.toHaveBeenCalled();
  });
});
