import { setDirectoryTrusted, upsertDirectoryVerification } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { listingKeyForAddress } from "@/lib/server/page-address";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { giveTrustedAction, removeTrustedAction, verifyBusinessAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, setDirectoryTrusted: vi.fn(), upsertDirectoryVerification: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/page-address", () => ({ listingKeyForAddress: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));

const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const KEY = "dentists/thane/naupada/care-dental";
const IDLE = { status: "idle" } as const;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(listingKeyForAddress).mockImplementation(async (raw: string) => raw);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("verifyBusinessAction", () => {
  const POSTED = { listing: KEY, businessName: "Care Dental", phone: "", phoneCountry: "IN" };

  it("gives Trusted along with Verified when the box is ticked", async () => {
    vi.mocked(upsertDirectoryVerification).mockResolvedValue({ replaced: false });
    await expect(verifyBusinessAction(IDLE, form({ ...POSTED, trusted: "on" }))).rejects.toThrow("redirect:/directory?show=verified&done=verified");
    expect(upsertDirectoryVerification).toHaveBeenCalledWith(DB, expect.objectContaining({ listingKey: KEY, businessName: "Care Dental", trusted: true }));
  });

  it("leaves a business's Trusted tag as it is when the box is not ticked", async () => {
    vi.mocked(upsertDirectoryVerification).mockResolvedValue({ replaced: true });
    await expect(verifyBusinessAction(IDLE, form(POSTED))).rejects.toThrow("redirect:/directory?show=verified&done=reverified");
    expect(vi.mocked(upsertDirectoryVerification).mock.calls[0]?.[1]).not.toHaveProperty("trusted");
  });

  it("keeps what was typed, the ticked box included, when the form is refused", async () => {
    const result = await verifyBusinessAction(IDLE, form({ ...POSTED, businessName: " ", trusted: "on" }));
    expect(result).toMatchObject({ status: "error", field: "businessName", values: { trusted: true, listing: KEY } });
    expect(upsertDirectoryVerification).not.toHaveBeenCalled();
  });
});

describe("the row's Trusted buttons", () => {
  const POSTED = { key: KEY, show: "verified", q: "", page: "1" };

  it("gives the tag and lands back on the same list", async () => {
    vi.mocked(setDirectoryTrusted).mockResolvedValue(true);
    await expect(giveTrustedAction(form(POSTED))).rejects.toThrow("redirect:/directory?show=verified&done=trusted_given");
    expect(setDirectoryTrusted).toHaveBeenCalledWith(DB, KEY, true, expect.any(Date));
  });

  it("takes the tag away", async () => {
    vi.mocked(setDirectoryTrusted).mockResolvedValue(true);
    await expect(removeTrustedAction(form(POSTED))).rejects.toThrow("redirect:/directory?show=verified&done=trusted_removed");
    expect(setDirectoryTrusted).toHaveBeenCalledWith(DB, KEY, false, expect.any(Date));
  });

  it("says nothing changed when someone got there first", async () => {
    vi.mocked(setDirectoryTrusted).mockResolvedValue(false);
    await expect(giveTrustedAction(form(POSTED))).rejects.toThrow("redirect:/directory?show=verified&done=unchanged");
  });

  it("refuses a key that is not a listing key", async () => {
    await expect(giveTrustedAction(form({ ...POSTED, key: "not a key" }))).rejects.toThrow("valid listing key");
    expect(setDirectoryTrusted).not.toHaveBeenCalled();
  });
});
