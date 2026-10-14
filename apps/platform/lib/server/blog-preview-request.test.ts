import { describe, expect, it, vi } from "vitest";
import { handleBlogPreviewRequest, type BlogPreviewDeps } from "./blog-preview-request";
import { signBlogPreviewToken } from "./blog-preview-token";
import type { SitePost } from "./site-api";

vi.mock("server-only", () => ({}));

const SECRET = "a-test-secret-that-is-long-enough-000";
const NOW = new Date("2026-09-24T10:00:00.000Z");
const BUSINESS = "0192f3c4-aaaa-7000-8000-00000000000a";
const OTHER_BUSINESS = "0192f3c4-bbbb-7000-8000-00000000000b";
const SITE_TOKEN = "f".repeat(64);
const POST: SitePost = {
  slug: "monsoon-menu",
  pathPrefix: "blog",
  previousSlugs: [],
  title: "Our new monsoon menu",
  excerpt: null,
  publishedAt: null,
  html: "<p>Draft</p>",
  coverImagePath: null,
  categories: [],
  updatedAt: null,
  category: null,
  author: null,
  seo: { title: "Our new monsoon menu", description: null, noIndex: false },
  coverImageAlt: null,
};

function deps(overrides: Partial<BlogPreviewDeps> = {}): BlogPreviewDeps {
  return {
    secret: SECRET,
    now: () => NOW,
    findTenantBySiteToken: vi.fn(async (token: string) => (token === SITE_TOKEN ? { businessId: BUSINESS, name: "Harbour" } : null)),
    findPreviewPost: vi.fn(async (businessId: string, postId: string) => (businessId === BUSINESS && postId === "42" ? POST : null)),
    ...overrides,
  };
}

function request(previewToken: string | null, siteToken: string | null = SITE_TOKEN): Request {
  const url = new URL("https://app.firstfold.io/api/site/posts/preview");
  if (previewToken !== null) url.searchParams.set("token", previewToken);
  return new Request(url, { headers: siteToken === null ? {} : { Authorization: `Bearer ${siteToken}` } });
}

const token = (businessId = BUSINESS, postId = "42") => signBlogPreviewToken(SECRET, { businessId, postId }, NOW);

describe("handleBlogPreviewRequest", () => {
  it("returns the draft for the site's own business, never cached or indexed", async () => {
    const response = await handleBlogPreviewRequest(request(token()), deps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ business: "Harbour", post: POST });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("refuses a missing or wrong site token with 401", async () => {
    expect((await handleBlogPreviewRequest(request(token(), null), deps())).status).toBe(401);
    expect((await handleBlogPreviewRequest(request(token(), "0".repeat(64)), deps())).status).toBe(401);
  });

  it("answers 404, identically, for a missing, bad, expired or other-business preview token", async () => {
    const expired = signBlogPreviewToken(SECRET, { businessId: BUSINESS, postId: "42" }, new Date(NOW.getTime() - 60 * 60 * 1000));
    for (const bad of [null, "nonsense", expired, token(OTHER_BUSINESS)]) {
      const response = await handleBlogPreviewRequest(request(bad), deps());
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "This preview link has expired or is not valid." });
    }
  });

  it("does not look the post up for another business, even with a valid token for it", async () => {
    const d = deps();
    await handleBlogPreviewRequest(request(token(OTHER_BUSINESS)), d);
    expect(d.findPreviewPost).not.toHaveBeenCalled();
  });

  it("answers 404 when the post was deleted after the link was made", async () => {
    const response = await handleBlogPreviewRequest(request(token(BUSINESS, "99")), deps());
    expect(response.status).toBe(404);
  });
});
