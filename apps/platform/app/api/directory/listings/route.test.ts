import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDirectoryFeed } from "@/lib/server/directory-feed";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/directory-feed", () => ({ readDirectoryFeed: vi.fn() }));

const mockedRead = vi.mocked(readDirectoryFeed);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/directory/listings", () => {
  it("returns the feed with a one-minute shared cache", async () => {
    mockedRead.mockResolvedValue({ version: 1, generatedAt: "2026-09-29T10:00:00.000Z", listings: [] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60, stale-while-revalidate=300");
    expect(await response.json()).toEqual({ version: 1, generatedAt: "2026-09-29T10:00:00.000Z", listings: [] });
  });

  it("answers 503 and no-store when the read fails", async () => {
    mockedRead.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
