import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./quietly", () => ({ quietly: async <T>(_scope: string, _label: string, fallback: T, work: () => Promise<T>): Promise<T> => work().catch(() => fallback) }));
vi.mock("./social-brand", () => ({ socialBrand: async (tenant: { businessId: string; businessName: string }) => ({ externalId: tenant.businessId, name: tenant.businessName, view: null }) }));
vi.mock("./social-auto", () => ({ socialAutoSettings: vi.fn(), loadSiteJobs: vi.fn(), loadBatches: vi.fn(), loadPosters: vi.fn(), loadTopics: vi.fn() }));

import { loadBatches, loadPosters, loadSiteJobs, loadTopics, socialAutoSettings } from "./social-auto";
import { loadSocialReview } from "./social-review";

const tenant = { userId: "u", businessId: "business-1", businessName: "Om Sweets", role: "owner" } as never;
const poster = (id: string, status: string, canRedraw = false): unknown => ({ id, batchId: "b", postId: "p", network: "instagram", shape: "square", width: 1, height: 1, headline: "h", caption: "c", versionNumber: 1, status, canRedraw, redrawsLeft: canRedraw ? 1 : 0, createdAt: "x" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
  vi.mocked(loadSiteJobs).mockResolvedValue([]);
  vi.mocked(loadBatches).mockResolvedValue({ batches: [], expired: [] });
  vi.mocked(loadTopics).mockResolvedValue([]);
});

describe("loadSocialReview", () => {
  it("asks once for every picture and sorts them into those waiting, including one that did not pass, and those approved", async () => {
    vi.mocked(loadPosters).mockResolvedValue({ posters: ["pending", "held", "blocked", "approved", "rejected", "superseded"].map((status) => poster(`v-${status}`, status)) as never, reasons: ["weak_copy"] });
    const review = await loadSocialReview(tenant);
    expect(loadPosters).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadPosters).mock.calls[0]?.[2]).toBe("all");
    expect(review.waiting.map((p) => p.id)).toEqual(["v-pending", "v-held", "v-blocked"]);
    expect(review.approved.map((p) => p.id)).toEqual(["v-approved"]);
    expect(review.reasons).toEqual(["weak_copy"]);
    expect(review.unavailable).toBe(false);
  });

  it("keeps a picture the customer put away only while another can be drawn", async () => {
    vi.mocked(loadPosters).mockResolvedValue({ posters: [poster("v-away", "rejected", true), poster("v-gone", "rejected", false)] as never, reasons: [] });
    expect((await loadSocialReview(tenant)).waiting.map((p) => p.id)).toEqual(["v-away"]);
  });

  it("is unavailable when social-auto is not set up, and says so when a read fails while keeping the others", async () => {
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    expect((await loadSocialReview(tenant)).unavailable).toBe(true);
    vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
    vi.mocked(loadPosters).mockResolvedValue({ posters: [], reasons: [] });
    vi.mocked(loadSiteJobs).mockRejectedValue(new Error("down"));
    vi.mocked(loadBatches).mockResolvedValue({ batches: [{ id: "week-01", createdAt: "x", networks: [], posts: [], rules: {} }], expired: [] });
    const review = await loadSocialReview(tenant);
    expect(review.unavailable).toBe(true);
    expect(review.batches).toHaveLength(1);
    expect(review.jobs).toEqual([]);
  });

  it("tells what was put away because nobody decided, and keeps an expired picture that can be drawn again among those waiting", async () => {
    vi.mocked(loadBatches).mockResolvedValue({ batches: [], expired: [{ id: "week-00.json", expiredAt: "2026-11-19T09:00:00.000Z" }] });
    const picture = (over: object): never => ({ id: "v1", batchId: "week-01", postId: "p1", network: "instagram", shape: "square", width: 1, height: 1, headline: "H", caption: "C", versionNumber: 1, status: "expired", canRedraw: true, redrawsLeft: 1, createdAt: "x", ...over }) as never;
    vi.mocked(loadPosters).mockResolvedValue({ posters: [picture({}), picture({ id: "v2", canRedraw: false })], reasons: [] });
    const review = await loadSocialReview(tenant);
    expect(review.expired.batches).toHaveLength(1);
    expect(review.expired.pictures.map((poster) => poster.id)).toEqual(["v1", "v2"]);
    expect(review.waiting.map((poster) => poster.id)).toEqual(["v1"]);
  });

  it("lists each connected network some post idea lacks, once", async () => {
    const topic = (missing: string[]): never => ({ batchId: "b", postId: "p", headline: "H", networks: [], missing }) as never;
    vi.mocked(loadPosters).mockResolvedValue({ posters: [], reasons: [] });
    vi.mocked(loadTopics).mockResolvedValue([topic(["facebook", "google"]), topic(["facebook"])]);
    expect((await loadSocialReview(tenant)).missingNetworks).toEqual(["facebook", "google"]);
  });
});
