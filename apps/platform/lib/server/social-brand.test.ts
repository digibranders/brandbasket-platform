import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBrands, socialAutoSettings } from "./social-auto";
import { socialBrand } from "./social-brand";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./social-auto", () => ({ socialAutoSettings: vi.fn(), loadBrands: vi.fn() }));

const B = "0192f3c4-0000-7000-8000-00000000000a";
const freshTenant = () => ({ userId: "u", businessId: B, businessName: "Om Sweets", role: "owner" }) as const;
const SETTINGS = { baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" };
const VIEW = {
  brands: [
    { externalId: B, name: "Om Sweets", website: null, archived: false },
    { externalId: `${B}:two`, name: "Om Snacks", website: null, archived: false },
  ],
  allowed: 2,
  used: 2,
};
const chosen = (value: string | undefined): void => void vi.mocked(cookies).mockResolvedValue({ get: () => (value === undefined ? undefined : { value }) } as never);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(socialAutoSettings).mockReturnValue(SETTINGS);
  chosen(undefined);
});

describe("socialBrand", () => {
  it("is the business's own brand when nothing else was chosen", async () => {
    vi.mocked(loadBrands).mockResolvedValue(VIEW);
    expect(await socialBrand(freshTenant())).toMatchObject({ externalId: B, name: "Om Sweets" });
  });

  it("is the brand the customer chose when it is one of the business's own", async () => {
    vi.mocked(loadBrands).mockResolvedValue(VIEW);
    chosen(`${B}:two`);
    expect(await socialBrand(freshTenant())).toMatchObject({ externalId: `${B}:two`, name: "Om Snacks" });
  });

  it("ignores a choice that is not in the business's list, so no other business's brand can be reached", async () => {
    vi.mocked(loadBrands).mockResolvedValue(VIEW);
    chosen("0192f3c4-9999-7000-8000-00000000000b:two");
    expect((await socialBrand(freshTenant())).externalId).toBe(B);
  });

  it("is the business's own brand, with no brands to show, when social-auto is not set up, does not know brands, or fails", async () => {
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    expect(await socialBrand(freshTenant())).toEqual({ externalId: B, name: "Om Sweets", view: null });
    vi.mocked(socialAutoSettings).mockReturnValue(SETTINGS);
    vi.mocked(loadBrands).mockResolvedValue(null);
    expect((await socialBrand(freshTenant())).view).toBeNull();
    vi.mocked(loadBrands).mockRejectedValue(new Error("down"));
    expect(await socialBrand(freshTenant())).toEqual({ externalId: B, name: "Om Sweets", view: null });
  });
});
