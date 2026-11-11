import { changeFreeAddressForBusiness, findOpenProjectForStaff, findPrimaryHostname, saveFreeAddressForBusiness } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { changeFreeAddressAction, useFreeAddressAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    changeFreeAddressForBusiness: vi.fn(),
    findOpenProjectForStaff: vi.fn(),
    findPrimaryHostname: vi.fn(),
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
const NAME = "harbour-bakery";
const ADDRESS = `${NAME}.${SITES}`;

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

    await expect(useFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?launch=address-unavailable`);
    expect(saveFreeAddressForBusiness).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it.each([["empty", ""], ["too short", "ab"], ["a dot", "a.b.c"], ["a space", "harbour bakery"], ["a kept name", "app"]])(
    "refuses a name that cannot be used (%s), and saves nothing",
    async (_label, name) => {
      await expect(useFreeAddressAction(form({ businessId: BUSINESS, name }))).rejects.toThrow("launch=address-invalid");
      expect(saveFreeAddressForBusiness).not.toHaveBeenCalled();
      expect(recordStaffAction).not.toHaveBeenCalled();
    },
  );

  it("refuses a request with no name at all", async () => {
    await expect(useFreeAddressAction(form({ businessId: BUSINESS }))).rejects.toThrow("launch=address-invalid");
    expect(saveFreeAddressForBusiness).not.toHaveBeenCalled();
  });

  it("leaves a business that already has a primary domain as it is", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("exists");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow("launch=address-unavailable");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("saves the typed name on the base domain, records it and says so", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("saved");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS, name: `  ${NAME.toUpperCase()} ` }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?launch=address-saved`);
    expect(saveFreeAddressForBusiness).toHaveBeenCalledWith(DB, { businessId: BUSINESS, hostname: ADDRESS });
    expect(recordStaffAction).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ businessId: BUSINESS, kind: "domain.free_address_saved", data: { hostname: ADDRESS } }),
    );
  });

  it("accepts the whole address pasted in", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("saved");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS, name: ADDRESS }))).rejects.toThrow("launch=address-saved");
    expect(saveFreeAddressForBusiness).toHaveBeenCalledWith(DB, { businessId: BUSINESS, hostname: ADDRESS });
  });

  it("says the address is taken, without making up another, when another business holds it", async () => {
    vi.mocked(saveFreeAddressForBusiness).mockResolvedValue("taken");

    await expect(useFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow("launch=address-taken");
    expect(saveFreeAddressForBusiness).toHaveBeenCalledTimes(1);
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("refuses a business id that is not a uuid, before reading anything", async () => {
    await expect(useFreeAddressAction(form({ businessId: "nope", name: NAME }))).rejects.toThrow("must be a valid id");
    expect(saveFreeAddressForBusiness).not.toHaveBeenCalled();
  });
});

describe("changeFreeAddressAction", () => {
  const CURRENT = `old-name.${SITES}`;

  beforeEach(() => {
    vi.mocked(findOpenProjectForStaff).mockResolvedValue({ status: "preview" } as Awaited<ReturnType<typeof findOpenProjectForStaff>>);
    vi.mocked(findPrimaryHostname).mockResolvedValue(CURRENT);
  });

  it("changes the address, records both and says so", async () => {
    vi.mocked(changeFreeAddressForBusiness).mockResolvedValue("changed");

    await expect(changeFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?launch=address-changed`);
    expect(changeFreeAddressForBusiness).toHaveBeenCalledWith(DB, { businessId: BUSINESS, hostname: ADDRESS });
    expect(recordStaffAction).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ businessId: BUSINESS, kind: "domain.free_address_changed", data: { from: CURRENT, to: ADDRESS } }),
    );
  });

  it("refuses a name that cannot be used, before reading the business", async () => {
    await expect(changeFreeAddressAction(form({ businessId: BUSINESS, name: "www" }))).rejects.toThrow("launch=address-invalid");
    expect(findOpenProjectForStaff).not.toHaveBeenCalled();
    expect(changeFreeAddressForBusiness).not.toHaveBeenCalled();
  });

  it.each([
    ["no open project", null],
    ["a live website", { status: "live" }],
  ])("changes nothing with %s", async (_label, project) => {
    vi.mocked(findOpenProjectForStaff).mockResolvedValue(project as Awaited<ReturnType<typeof findOpenProjectForStaff>>);

    await expect(changeFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow("launch=address-locked");
    expect(changeFreeAddressForBusiness).not.toHaveBeenCalled();
  });

  it.each([
    ["no domain", null],
    ["a domain the customer owns", "harbour.in"],
  ])("changes nothing when the business has %s", async (_label, hostname) => {
    vi.mocked(findPrimaryHostname).mockResolvedValue(hostname);

    await expect(changeFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow("launch=address-locked");
    expect(changeFreeAddressForBusiness).not.toHaveBeenCalled();
  });

  it("says the address is taken when another business holds it, and keeps the old one", async () => {
    vi.mocked(changeFreeAddressForBusiness).mockResolvedValue("taken");

    await expect(changeFreeAddressAction(form({ businessId: BUSINESS, name: NAME }))).rejects.toThrow("launch=address-taken");
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});
