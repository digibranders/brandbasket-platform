import { listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBillingAccess } from "@/lib/server/billing";
import { archiveBrand, createBrand, loadBrands, SocialAutoError, socialAutoSettings } from "@/lib/server/social-auto";
import { addBrandAction, archiveBrandAction, selectBrandAction } from "./brand-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  // Next lets its own control-flow errors (not found, redirect) pass; here that is the not-found one.
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message === "notFound") throw error;
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/billing", () => ({ requireBillingAccess: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), listBoughtSetupServices: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("@/lib/server/social-auto", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/social-auto")>()), socialAutoSettings: vi.fn(), loadBrands: vi.fn(), createBrand: vi.fn(), archiveBrand: vi.fn() }));

const B = "0192f3c4-0000-7000-8000-00000000000a";
const tenant = { userId: "user-1", businessId: B, businessName: "Om Sweets", role: "owner" };
const SETTINGS = { baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" };
const brand = (externalId: string, name: string, archived = false) => ({ externalId, name, website: null, archived });
const view = (over: Partial<{ brands: ReturnType<typeof brand>[]; allowed: number; used: number }> = {}) => ({ brands: [brand(B, "Om Sweets"), brand(`${B}:two`, "Om Snacks")], allowed: 3, used: 2, ...over });
const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};
const jar = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireBillingAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ kind: "tx" } as never));
  vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"] as never);
  vi.mocked(socialAutoSettings).mockReturnValue(SETTINGS);
  vi.mocked(loadBrands).mockResolvedValue(view());
  vi.mocked(cookies).mockResolvedValue(jar as never);
});

describe("selectBrandAction", () => {
  it("remembers one of the business's own live brands and refreshes the pages", async () => {
    expect(await selectBrandAction(form({ brand: `${B}:two` }))).toEqual({ status: "saved" });
    expect(jar.set).toHaveBeenCalledWith("bb_social_brand", `${B}:two`, expect.objectContaining({ httpOnly: true }));
    expect(revalidatePath).toHaveBeenCalledWith("/social");
  });

  it("refuses a brand that is not in the business's list, an archived one, and an id that is not one", async () => {
    expect(await selectBrandAction(form({ brand: "0192f3c4-9999-7000-8000-00000000000b:two" }))).toMatchObject({ status: "error" });
    vi.mocked(loadBrands).mockResolvedValue(view({ brands: [brand(B, "A"), brand(`${B}:old`, "Old", true)] }));
    expect(await selectBrandAction(form({ brand: `${B}:old` }))).toMatchObject({ status: "error" });
    expect(await selectBrandAction(form({ brand: "../x y" }))).toMatchObject({ status: "error" });
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("is refused for a business that did not buy Social media", async () => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"] as never);
    await expect(selectBrandAction(form({ brand: B }))).rejects.toThrow("notFound");
  });
});

describe("addBrandAction", () => {
  it("makes a further brand in the business's group with a key of its own, and looks at it", async () => {
    vi.mocked(createBrand).mockResolvedValue(undefined);
    expect(await addBrandAction(form({ name: "  Om Namkeen " }))).toEqual({ status: "saved" });
    const [, businessId, key, name] = vi.mocked(createBrand).mock.calls[0] ?? [];
    expect(businessId).toBe(B);
    expect(key).toMatch(/^[a-z0-9]{8}$/);
    expect(name).toBe("Om Namkeen");
    expect(jar.set).toHaveBeenCalledWith("bb_social_brand", `${B}:${String(key)}`, expect.anything());
  });

  it("does not ask when the business has all the brands it may have, and says so in plain words", async () => {
    vi.mocked(loadBrands).mockResolvedValue(view({ allowed: 2, used: 2 }));
    expect(await addBrandAction(form({ name: "More" }))).toEqual({ status: "error", message: expect.stringContaining("as many brands as your plan allows") });
    expect(createBrand).not.toHaveBeenCalled();
  });

  it("uses its own words when the posting service refuses, and refuses an empty or very long name", async () => {
    vi.mocked(createBrand).mockRejectedValue(new SocialAutoError("limit", 409, "x", "BRAND_LIMIT_REACHED"));
    expect(await addBrandAction(form({ name: "More" }))).toEqual({ status: "error", message: expect.stringContaining("as many brands as your plan allows") });
    expect(await addBrandAction(form({ name: "   " }))).toMatchObject({ status: "error" });
    expect(await addBrandAction(form({ name: "x".repeat(81) }))).toMatchObject({ status: "error", message: "That name is too long." });
  });

  it("says brands are not available when the posting service does not know them", async () => {
    vi.mocked(loadBrands).mockResolvedValue(null);
    expect(await addBrandAction(form({ name: "More" }))).toEqual({ status: "error", message: expect.stringContaining("not available") });
  });
});

describe("archiveBrandAction", () => {
  it("archives one of the business's brands and sends her back to the first that is left", async () => {
    vi.mocked(archiveBrand).mockResolvedValue(undefined);
    expect(await archiveBrandAction(form({ brand: `${B}:two`, archived: "true" }))).toEqual({ status: "saved" });
    expect(archiveBrand).toHaveBeenCalledWith(expect.anything(), `${B}:two`, true);
    expect(jar.delete).toHaveBeenCalledWith("bb_social_brand");
  });

  it("keeps at least one brand, brings a brand back, and refuses a brand that is not the business's own", async () => {
    vi.mocked(loadBrands).mockResolvedValue(view({ brands: [brand(B, "Only"), brand(`${B}:old`, "Old", true)], used: 1 }));
    expect(await archiveBrandAction(form({ brand: B, archived: "true" }))).toEqual({ status: "error", message: expect.stringContaining("Keep at least one brand") });
    expect(archiveBrand).not.toHaveBeenCalled();
    vi.mocked(archiveBrand).mockResolvedValue(undefined);
    expect(await archiveBrandAction(form({ brand: `${B}:old`, archived: "false" }))).toEqual({ status: "saved" });
    expect(archiveBrand).toHaveBeenCalledWith(expect.anything(), `${B}:old`, false);
    expect(await archiveBrandAction(form({ brand: "0192f3c4-9999-7000-8000-00000000000b:x", archived: "true" }))).toMatchObject({ status: "error" });
    expect(await archiveBrandAction(form({ brand: B, archived: "maybe" }))).toMatchObject({ status: "error" });
  });
});
