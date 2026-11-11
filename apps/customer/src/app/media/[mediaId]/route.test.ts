// @vitest-environment node
import { serveTenantMedia } from "@brandbasket/shared/server/media-serving";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomer } from "@/lib/guards";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/guards", () => ({ requireCustomer: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn(() => ({ kind: "storage" })) }));
vi.mock("@brandbasket/shared/server/media-serving", () => ({ serveTenantMedia: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });

function call(headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request("http://localhost:3197/media/m1", { headers }), { params: Promise.resolve({ mediaId: "m1" }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomer).mockResolvedValue({ tenant } as never);
  vi.mocked(serveTenantMedia).mockResolvedValue(new Response("image"));
});

describe("GET /media/[mediaId]", () => {
  it("is a bare 401 where the guard redirects, and serves nothing", async () => {
    vi.mocked(requireCustomer).mockRejectedValue(redirect);
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(serveTenantMedia).not.toHaveBeenCalled();
  });

  it("serves the image for the session's own business only, with the caller's ETag", async () => {
    const response = await call({ "if-none-match": '"abc"' });
    expect(await response.text()).toBe("image");
    expect(serveTenantMedia).toHaveBeenCalledWith({ kind: "app-db" }, { kind: "storage" }, tenant, "m1", '"abc"');
  });
});
