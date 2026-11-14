import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ listConnectedAccounts: vi.fn(), listMonthlySnapshots: vi.fn(), listServiceSetups: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/legacy-social/server/social-auto", () => ({ loadBrands: vi.fn(), loadChannels: vi.fn(), socialAutoSettings: vi.fn() }));

import { loadBrands, loadChannels, socialAutoSettings } from "@/legacy-social/server/social-auto";
import { postingServiceHasAccounts } from "./saved-answers";

const settings = { baseUrl: "http://x", key: "k", returnUrl: "http://x/social" };
const customer = { businessId: "b1", businessName: "Acme" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(socialAutoSettings).mockReturnValue(settings);
});

describe("postingServiceHasAccounts", () => {
  it("is true when the customer connected an Instagram or Facebook account in the posting service", async () => {
    vi.mocked(loadBrands).mockResolvedValue(null);
    vi.mocked(loadChannels).mockResolvedValue([{ id: "i1", platform: "instagram", account: "acme", connectedAt: null, expiresAt: null, paused: false }] as never);
    expect(await postingServiceHasAccounts(customer)).toBe(true);
    expect(vi.mocked(loadChannels).mock.calls[0]?.[1]).toBe("b1");
  });

  it("counts an account on any of her brands", async () => {
    vi.mocked(loadBrands).mockResolvedValue({ brands: [{ externalId: "b1", name: "A", website: null, archived: false }, { externalId: "b1:two", name: "B", website: null, archived: false }], allowed: 2, used: 2 });
    vi.mocked(loadChannels).mockImplementation(async (_settings, id) => (id === "b1:two" ? ([{ id: "f1", platform: "facebook", account: "page" }] as never) : []));
    expect(await postingServiceHasAccounts(customer)).toBe(true);
  });

  it("is false for LinkedIn or Google only, with no accounts, with no posting service, and when the read fails", async () => {
    vi.mocked(loadBrands).mockResolvedValue(null);
    vi.mocked(loadChannels).mockResolvedValue([{ id: "l1", platform: "linkedin", account: "me" }, { id: "g1", platform: "google", account: "shop" }] as never);
    expect(await postingServiceHasAccounts(customer)).toBe(false);
    vi.mocked(loadChannels).mockResolvedValue([]);
    expect(await postingServiceHasAccounts(customer)).toBe(false);
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    expect(await postingServiceHasAccounts(customer)).toBe(false);
    vi.mocked(socialAutoSettings).mockReturnValue(settings);
    vi.mocked(loadChannels).mockRejectedValue(new Error("down"));
    expect(await postingServiceHasAccounts(customer)).toBe(false);
  });
});
