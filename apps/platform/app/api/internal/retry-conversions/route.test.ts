import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryFailedConversions } from "@/lib/server/conversions";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/conversions", () => ({ retryFailedConversions: vi.fn(async () => ({ retried: 3 })) }));

const TOKEN = "t".repeat(40);
const request = (authorization?: string): Request =>
  new Request("https://app.example/api/internal/retry-conversions", { method: "POST", headers: authorization === undefined ? {} : { authorization } });

beforeEach(() => {
  vi.stubEnv("SITE_ANALYTICS_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/internal/retry-conversions", () => {
  it("answers 503 while the job's secret is not set", async () => {
    vi.stubEnv("SITE_ANALYTICS_TOKEN", "");
    expect((await POST(request(`Bearer ${TOKEN}`))).status).toBe(503);
    expect(retryFailedConversions).not.toHaveBeenCalled();
  });

  it("answers 401 to a missing or wrong secret, and does nothing", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request(`Bearer ${"x".repeat(40)}`))).status).toBe(401);
    expect(retryFailedConversions).not.toHaveBeenCalled();
  });

  it("reports the failed sends again with the right secret and says how many", async () => {
    const response = await POST(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ retried: 3 });
  });
});
