import { describe, expect, it, vi } from "vitest";
import { serveSupportAttachment } from "./support-attachment-serving";
vi.mock("server-only", () => ({}));
describe("support attachment authorization", () => {
  it("never reads storage when the authorized query refuses ownership or visibility", async () => {
    const get = vi.fn();
    const response = await serveSupportAttachment(
      {
        find: async () => null,
        storage: { get, put: vi.fn(), delete: vi.fn() },
      },
      "0192f3c4-1111-7000-8000-000000000001",
    );
    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("serves authorized bytes without caching or original filenames", async () => {
    const response = await serveSupportAttachment(
      {
        find: async () => ({ storageKey: "key", mimeType: "image/webp" }),
        storage: {
          get: async () => new Uint8Array([1, 2]),
          put: vi.fn(),
          delete: vi.fn(),
        },
      },
      "0192f3c4-1111-7000-8000-000000000001",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe("inline");
  });
});
it("rejects malformed ids before the authorized database query", async () => {
  const find = vi.fn();
  const response = await serveSupportAttachment(
    { find, storage: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } },
    "../escape",
  );
  expect(response.status).toBe(404);
  expect(find).not.toHaveBeenCalled();
});
