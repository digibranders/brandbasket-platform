import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyBlogPreviewToken } from "@/lib/server/blog-preview-token";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { isMediaPublished } from "@/lib/server/site-media";
import { GET, OPTIONS } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/blog-preview-link", () => ({ blogPreviewSecret: () => "secret" }));
vi.mock("@/lib/server/blog-preview-token", () => ({ verifyBlogPreviewToken: vi.fn() }));
vi.mock("@/lib/server/site-media", () => ({ isMediaPublished: vi.fn() }));
vi.mock("@/lib/server/payload-media-serving", () => ({ servePayloadMediaFile: vi.fn() }));

const mockedIsMediaPublished = vi.mocked(isMediaPublished);
const mockedServe = vi.mocked(servePayloadMediaFile);
const mockedVerify = vi.mocked(verifyBlogPreviewToken);

function call(mediaId: string, query = ""): Promise<Response> {
  return GET(new Request(`http://app.localhost/api/site/media/${mediaId}${query}`), { params: Promise.resolve({ mediaId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedServe.mockResolvedValue(new Response("bytes", { status: 200 }));
});

describe("GET /api/site/media/[mediaId]", () => {
  it("serves an image that is on a published post, with no sign-in needed", async () => {
    mockedIsMediaPublished.mockResolvedValue(true);

    const response = await call("5");

    expect(response.status).toBe(200);
    expect(mockedServe).toHaveBeenCalledWith("5", null, { sharing: "public" });
  });

  it("gives a bare 404 for an image that is not on a published post, without reading the file", async () => {
    mockedIsMediaPublished.mockResolvedValue(false);

    const response = await call("6");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mockedServe).not.toHaveBeenCalled();
  });

  it("shows a draft's image to a valid preview pass, scoped to the pass's own business", async () => {
    mockedVerify.mockReturnValue({ businessId: "biz-1", postId: "post-1" });

    const response = await call("7", "?preview=pass");

    expect(response.status).toBe(200);
    expect(mockedServe).toHaveBeenCalledWith("7", "biz-1", { sharing: "preview" });
    expect(mockedIsMediaPublished).not.toHaveBeenCalled();
  });

  it("gives a bare 404 for a preview pass that is expired or forged, even if the image is published", async () => {
    mockedVerify.mockReturnValue(null);
    mockedIsMediaPublished.mockResolvedValue(true);

    const response = await call("7", "?preview=bad");

    expect(response.status).toBe(404);
    expect(mockedServe).not.toHaveBeenCalled();
  });

  it("answers the browser's CORS preflight", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
