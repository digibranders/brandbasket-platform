import { findBusinessSlug, saveFreeAddressForBusiness } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { useFreeAddressAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findBusinessSlug: vi.fn(),
    saveFreeAddressForBusiness: vi.fn(),
  };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
// The page's other actions' server modules: not under test here, and they reach for the environment when loaded.
vi.mock("@/lib/server/add-ons-admin", () => ({
  endClientAddOn: vi.fn(),
  markClientAddOnContacted: vi.fn(),
  setClientPressReleaseStatus: vi.fn(),
}));
vi.mock("@/lib/server/billing-admin", () => ({}));
vi.mock("@/lib/server/charges-admin", () => ({}));
vi.mock("@/lib/server/project-launch", () => ({}));
vi.mock("@/lib/server/project-preview", () => ({}));
vi.mock("@/lib/server/site-token", () => ({}));
vi.mock("@/lib/server/web-address", () => ({ changeWebAddress: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as unknown as GrantedStaff;
const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
const SITES = "sites.brandbasket.in";
const SLUG = "harbour-bakery";
/** The last six hex digits of the business id, the disambiguator the retry adds. */
const DISAMBIGUATOR = "8a882c";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CLIENT_SITE_BASE_DOMAIN", SITES);
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(findBusinessSlug).mockResolvedValue(SLUG);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useFreeAddressAction", () => {
  it("offers nothing when no base domain is configured, and touches no business", async () => {
    vi.stubEnv("CLIENT_SITE_BASE_DOMAIN", "");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?launch=address-unavailable`);
    expect(saveFreeAddressForBusiness).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("leaves a business that already has a primary domain as it is", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("exists");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS }))).rejects.toThrow("launch=address-unavailable");
    expect(saveFreeAddressForBusiness).toHaveBeenCalledTimes(1);
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("saves the slug's free address, records it and says so", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("saved");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?launch=address-saved`);
    expect(saveFreeAddressForBusiness).toHaveBeenCalledWith(DB, { businessId: BUSINESS, hostname: `${SLUG}.${SITES}` });
    expect(recordStaffAction).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ businessId: BUSINESS, kind: "domain.free_address_saved", data: { hostname: `${SLUG}.${SITES}` } }),
    );
  });

  it("retries once with a disambiguator when the plain address is taken", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValueOnce("taken").mockResolvedValueOnce("saved");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS }))).rejects.toThrow("launch=address-saved");
    expect(saveFreeAddressForBusiness).toHaveBeenNthCalledWith(2, DB, {
      businessId: BUSINESS,
      hostname: `${SLUG}-${DISAMBIGUATOR}.${SITES}`,
    });
    expect(recordStaffAction).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ data: { hostname: `${SLUG}-${DISAMBIGUATOR}.${SITES}` } }),
    );
  });

  it("says no address could be made when the retry is taken as well", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("taken");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS }))).rejects.toThrow("launch=address-unavailable");
    expect(saveFreeAddressForBusiness).toHaveBeenCalledTimes(2);
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("refuses a business id that is not a uuid, before reading anything", async () => {
    await expect(useFreeAddressAction(form({ businessId: "nope" }))).rejects.toThrow("must be a valid id");
    expect(saveFreeAddressForBusiness).not.toHaveBeenCalled();
  });
});
