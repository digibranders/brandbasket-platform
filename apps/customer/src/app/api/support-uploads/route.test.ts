// @vitest-environment node
import { findOpenClosureForUser } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSignedIn } from "@/lib/guards";
import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/guards", () => ({ requireSignedIn: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })), getStaffDb: vi.fn(() => ({ kind: "staff-db" })) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@brandbasket/shared/server/support-storage", () => ({ getSupportStorage: vi.fn(() => ({ kind: "support-storage" })) }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), findOpenClosureForUser: vi.fn() }));

const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
const ID = "0192f3c4-0000-7000-8000-00000000000a";

function fromTheApp(method: "POST" | "DELETE", url: string, extra: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { host: "app.brandbasket.in", origin: "https://app.brandbasket.in", ...extra },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireSignedIn).mockResolvedValue({ user: { id: "user-1" } } as never);
  vi.mocked(findOpenClosureForUser).mockResolvedValue(null);
});

describe("POST /api/support-uploads", () => {
  it("answers 401 where the guard redirects", async () => {
    vi.mocked(requireSignedIn).mockRejectedValue(redirect);
    const response = await POST(fromTheApp("POST", "https://app.brandbasket.in/api/support-uploads", { "content-length": "10", "content-type": "multipart/form-data; boundary=x" }));
    expect(response.status).toBe(401);
  });

  it("answers 409 to an account that is closing, in words that say how to get back in", async () => {
    vi.mocked(findOpenClosureForUser).mockResolvedValue({ eraseAfter: new Date() } as never);
    const response = await POST(fromTheApp("POST", "https://app.brandbasket.in/api/support-uploads", { "content-length": "10", "content-type": "multipart/form-data; boundary=x" }));
    expect(response.status).toBe(409);
  });

  it("refuses an upload that did not come from the app, before the guard", async () => {
    const response = await POST(new Request("https://app.brandbasket.in/api/support-uploads", { method: "POST", headers: { host: "app.brandbasket.in", origin: "https://evil.example", "content-length": "10" } }));
    expect(response.status).toBe(403);
    expect(requireSignedIn).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/support-uploads", () => {
  it("answers 401 where the guard redirects", async () => {
    vi.mocked(requireSignedIn).mockRejectedValue(redirect);
    expect((await DELETE(fromTheApp("DELETE", `https://app.brandbasket.in/api/support-uploads?attachmentId=${ID}`))).status).toBe(401);
  });

  it("answers 401 to an account that is closing", async () => {
    vi.mocked(findOpenClosureForUser).mockResolvedValue({ eraseAfter: new Date() } as never);
    expect((await DELETE(fromTheApp("DELETE", `https://app.brandbasket.in/api/support-uploads?attachmentId=${ID}`))).status).toBe(401);
  });

  it("answers 404 to an id that is not an id", async () => {
    expect((await DELETE(fromTheApp("DELETE", "https://app.brandbasket.in/api/support-uploads?attachmentId=nope"))).status).toBe(404);
  });
});
