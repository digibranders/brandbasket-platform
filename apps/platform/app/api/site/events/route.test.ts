import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, recordSiteEvent } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { findTenantBySiteToken, siteHasAccess } from "@/lib/server/site-api";
import { SITE_EVENT_BODY_LIMIT } from "@/lib/site-events";
import { OPTIONS, POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/site-api", () => ({ findTenantBySiteToken: vi.fn(), siteHasAccess: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ consumeRateLimit: vi.fn(), recordSiteEvent: vi.fn() }));

const mockedGetStaffDb = vi.mocked(getStaffDb);
const mockedFindTenant = vi.mocked(findTenantBySiteToken);
const mockedSiteHasAccess = vi.mocked(siteHasAccess);
const mockedConsume = vi.mocked(consumeRateLimit);
const mockedRecord = vi.mocked(recordSiteEvent);

const TOKEN = "t".repeat(40);
const DB = {} as never;

function post(body: string, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }): Request {
  return new Request("http://app.localhost:3001/api/site/events", { method: "POST", body, headers });
}

function expectCorsAndNoStore(response: Response): void {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetStaffDb.mockReturnValue(DB);
  mockedFindTenant.mockResolvedValue({ businessId: "biz-1", name: "Smile Dental" });
  mockedSiteHasAccess.mockResolvedValue(true);
  mockedConsume.mockResolvedValue({ allowed: true, remaining: 119, retryAfterSeconds: 0 });
  mockedRecord.mockResolvedValue(undefined);
});

describe("POST /api/site/events", () => {
  it("refuses a request with no token, reading and recording nothing", async () => {
    const response = await POST(post('{"kind":"call"}', {}));
    expect(response.status).toBe(401);
    expectCorsAndNoStore(response);
    expect(mockedFindTenant).not.toHaveBeenCalled();
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("refuses an unknown token", async () => {
    mockedFindTenant.mockResolvedValue(null);
    const response = await POST(post('{"kind":"call"}'));
    expect(response.status).toBe(401);
    expectCorsAndNoStore(response);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("answers the offline answer, recording nothing, once the plan has ended", async () => {
    mockedSiteHasAccess.mockResolvedValue(false);
    const response = await POST(post('{"kind":"call"}'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "This website is offline.", code: "site_offline" });
    expectCorsAndNoStore(response);
    expect(mockedConsume).not.toHaveBeenCalled();
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it.each(["not json", "[]", '{"kind":"visit"}', '{"kind":"call","businessId":"biz-2"}', ""])("answers 400 to the body %j", async (body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expectCorsAndNoStore(response);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("answers 413 to a body over the limit, whether or not it says how long it is", async () => {
    const big = JSON.stringify({ kind: "call", pad: "x".repeat(SITE_EVENT_BODY_LIMIT) });
    const response = await POST(post(big));
    expect(response.status).toBe(413);
    expectCorsAndNoStore(response);
    const streamed = new Request("http://app.localhost:3001/api/site/events", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(SITE_EVENT_BODY_LIMIT + 1)));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await POST(streamed)).status).toBe(413);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After over 120 events a minute for the business", async () => {
    mockedConsume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 17 });
    const response = await POST(post('{"kind":"form"}'));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expectCorsAndNoStore(response);
    expect(mockedConsume).toHaveBeenCalledWith(DB, "site-event:biz-1", { limit: 120, windowSeconds: 60 });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("records one event for the business of the token and answers 204", async () => {
    const response = await POST(post('{"kind":"whatsapp"}'));
    expect(response.status).toBe(204);
    expectCorsAndNoStore(response);
    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(DB, { businessId: "biz-1", kind: "whatsapp", at: expect.any(Date) });
  });

  it("answers 500 without the token in the body or the logs when the database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRecord.mockRejectedValue(new Error(`insert failed, params: ${TOKEN}`));
    const response = await POST(post('{"kind":"call"}'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong." });
    expectCorsAndNoStore(response);
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("OPTIONS /api/site/events", () => {
  it("answers a preflight with CORS headers", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
