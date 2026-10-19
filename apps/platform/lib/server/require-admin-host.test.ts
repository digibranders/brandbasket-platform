import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://admin.localhost:3000" }) }));

const { isAdminHostRequest, requireAdminHost } = await import("./require-admin-host");

function requestWithHost(host: string | null): Request {
  const headers = new Headers();
  if (host !== null) headers.set("host", host);
  return new Request("http://admin.localhost:3000/api/access", { headers });
}

describe("isAdminHostRequest", () => {
  it("allows the admin host", () => {
    expect(isAdminHostRequest(requestWithHost("admin.localhost:3000"))).toBe(true);
  });

  it("refuses the app host", () => {
    expect(isAdminHostRequest(requestWithHost("app.localhost:3000"))).toBe(false);
  });

  it("refuses an unrelated (marketing) host", () => {
    expect(isAdminHostRequest(requestWithHost("localhost:3000"))).toBe(false);
    expect(isAdminHostRequest(requestWithHost("brandbasket.in"))).toBe(false);
  });

  it("refuses a missing Host header", () => {
    expect(isAdminHostRequest(requestWithHost(null))).toBe(false);
  });

  it("allows a mixed-case admin host, matching isPayloadAdminPath's case-insensitivity", () => {
    expect(isAdminHostRequest(requestWithHost("ADMIN.localhost:3000"))).toBe(true);
    expect(isAdminHostRequest(requestWithHost("Admin.Localhost:3000"))).toBe(true);
  });

  it("refuses a host that merely starts with the admin host's name", () => {
    expect(isAdminHostRequest(requestWithHost("admin.localhost:3000.evil.io"))).toBe(false);
    expect(isAdminHostRequest(requestWithHost("notadmin.localhost:3000"))).toBe(false);
  });
});

describe("requireAdminHost", () => {
  it("runs the handler and returns its response on the admin host", async () => {
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const guarded = requireAdminHost(handler);

    const response = await guarded(requestWithHost("admin.localhost:3000"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("404s without calling the handler on any other host", async () => {
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const guarded = requireAdminHost(handler);

    const response = await guarded(requestWithHost("app.localhost:3000"));

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("forwards every argument to the handler, for route handlers with a params argument", async () => {
    type RouteArgs = { params: Promise<{ slug?: string[] }> };
    const handler = vi.fn<(request: Request, args: RouteArgs) => Promise<Response>>();
    handler.mockResolvedValue(new Response(null, { status: 200 }));
    const guarded = requireAdminHost(handler);
    const args: RouteArgs = { params: Promise.resolve({ slug: ["access"] }) };

    await guarded(requestWithHost("admin.localhost:3000"), args);

    expect(handler).toHaveBeenCalledWith(expect.any(Request), args);
  });
});
