import { beforeEach, describe, expect, it, vi } from "vitest";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { isMediaPublished } from "@/lib/server/site-media";
import { GET, OPTIONS } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/site-media", () => ({ isMediaPublished: vi.fn() }));
vi.mock("@/lib/server/payload-media-serving", () => ({ servePayloadMediaFile: vi.fn() }));

const mockedIsMediaPublished = vi.mocked(isMediaPublished);
const mockedServe = vi.mocked(servePayloadMediaFile);

function call(mediaId: string): Promise<Response> {
  return GET(new Request(`http://app.localhost/api/site/media/${mediaId}`), { params: Promise.resolve({ mediaId }) });
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
    expect(mockedServe).toHaveBeenCalledWith("5", null, { publicContent: true });
  });

  it("gives a bare 404 for an image that is not on a published post, without reading the file", async () => {
    mockedIsMediaPublished.mockResolvedValue(false);

    const response = await call("6");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mockedServe).not.toHaveBeenCalled();
  });

  it("answers the browser's CORS preflight", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
