import { describe, expect, it, vi } from "vitest";
import { reportRequestError, requestErrorOperation } from "./request-error";

const context = { routeType: "action", routePath: "/billing" } as const;

describe("reportRequestError", () => {
  it("reports once to Sentry and once to the native inbox with the operation", async () => {
    const sentry = vi.fn();
    const native = vi.fn(async () => "id");
    await reportRequestError({ path: "/billing" }, context, "nodejs", { sentry, native });
    expect(sentry).toHaveBeenCalledTimes(1);
    expect(native).toHaveBeenCalledExactlyOnceWith("server_action");
  });

  it("still reports natively when Sentry throws", async () => {
    const native = vi.fn(async () => null);
    await expect(reportRequestError({ path: "/billing" }, context, "nodejs", { sentry: () => { throw new Error("sentry down"); }, native })).resolves.toBeUndefined();
    expect(native).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the native inbox fails, and Sentry was still told", async () => {
    const sentry = vi.fn();
    await expect(reportRequestError({ path: "/billing" }, context, "nodejs", { sentry, native: async () => { throw new Error("db down"); } })).resolves.toBeUndefined();
    expect(sentry).toHaveBeenCalledTimes(1);
  });

  it("skips the native copy off the Node.js runtime and for the error collector itself", async () => {
    const native = vi.fn(async () => null);
    const sentry = vi.fn();
    await reportRequestError({ path: "/billing" }, context, "edge", { sentry, native });
    await reportRequestError({ path: "/api/error-reports?x=1" }, context, "nodejs", { sentry, native });
    expect(native).not.toHaveBeenCalled();
    expect(sentry).toHaveBeenCalledTimes(2);
  });
});

describe("requestErrorOperation", () => {
  it("maps every route type to a fixed operation", () => {
    expect(["render", "route", "action", "proxy"].map((type) => requestErrorOperation(type as "render"))).toEqual(["server_render", "server_route", "server_action", "server_proxy"]);
  });
});
