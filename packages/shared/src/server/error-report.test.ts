import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createErrorReportCollector, createServerErrorReporter } from "./error-report";
import { createErrorReport } from "../lib/error-report";

const context = { app: "platform" as const, operation: "server_action" as const, route: "/appointments/Alice?token=secret" };
const requestFor = (report: unknown, origin = "https://app.example"): Request => new Request("https://app.example/api/error-reports", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(report) });

describe("native server error reporter", () => {
  it("writes sanitized metadata with server-derived identity and isolates store failure", async () => {
    const writeReport = vi.fn().mockResolvedValue("issue-id");
    const report = createServerErrorReporter({ writeReport });
    expect(await report(new Error("patient secret"), { ...context, userId: "session-user" })).toBe("issue-id");
    expect(writeReport.mock.calls[0]?.[0]).toMatchObject({ route: "/appointments/[id]", errorClass: "Error" });
    expect(JSON.stringify(writeReport.mock.calls[0]?.[0])).not.toMatch(/secret|session-user/);
    expect(writeReport.mock.calls[0]?.[1]).toBe("session-user");
    writeReport.mockRejectedValue(new Error("database unavailable"));
    expect(await report(new Error("private"), context)).toBeNull();
  });

  it("deduplicates the same error and honors admission limits", async () => {
    const writeReport = vi.fn().mockResolvedValue("issue-id");
    const report = createServerErrorReporter({ writeReport, allowReport: async () => false });
    expect(await report(new Error("private"), context)).toBeNull();
    expect(writeReport).not.toHaveBeenCalled();
    const accepted = createServerErrorReporter({ writeReport });
    const error = new Error("private");
    await accepted(error, context);
    await accepted(error, context);
    expect(writeReport).toHaveBeenCalledTimes(1);
  });
});

describe("native browser collector boundary", () => {
  function fixture() {
    const writeReport = vi.fn().mockResolvedValue("issue-id");
    const consumeLimit = vi.fn().mockResolvedValue(true);
    const collector = createErrorReportCollector({ app: "platform", getOrigin: () => "https://app.example", getSessionUser: async () => ({ id: "actual-session-user" }), writeReport, consumeLimit });
    return { collector, writeReport, consumeLimit };
  }
  it("derives identity server-side and overwrites client browser family from the request", async () => {
    const { collector, writeReport } = fixture();
    const report = createErrorReport(new Error("private"), { ...context, operation: "browser_uncaught" });
    const response = await collector(requestFor(report));
    expect(response.status).toBe(204);
    expect(writeReport.mock.calls[0]?.[1]).toBe("actual-session-user");
    expect(writeReport.mock.calls[0]?.[0]?.browser).toBe("Other");
  });
  it("rejects foreign origin, spoofed identity, server operations and oversized payloads", async () => {
    const { collector, writeReport } = fixture();
    const report = createErrorReport(new Error("private"), { ...context, operation: "browser_uncaught" });
    expect((await collector(requestFor(report, "https://foreign.example"))).status).toBe(403);
    expect((await collector(requestFor({ ...report, userId: "victim" }))).status).toBe(400);
    expect((await collector(requestFor({ ...report, operation: "server_action" }))).status).toBe(400);
    expect((await collector(requestFor({ padding: "s".repeat(10_000) }))).status).toBe(413);
    expect(writeReport).not.toHaveBeenCalled();
  });
  it("fails closed under rate limits and never propagates monitoring store errors", async () => {
    const { collector, writeReport, consumeLimit } = fixture();
    const report = createErrorReport(new Error("private"), { ...context, operation: "browser_uncaught" });
    consumeLimit.mockResolvedValue(false);
    expect((await collector(requestFor(report))).status).toBe(429);
    expect(writeReport).not.toHaveBeenCalled();
    consumeLimit.mockResolvedValue(true);
    writeReport.mockRejectedValue(new Error("private SQL"));
    const response = await collector(requestFor(report));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
  it("accepts anonymous reports but rejects wrong hosts and application identities", async () => {
    const writeReport = vi.fn().mockResolvedValue("issue-id");
    const collector = createErrorReportCollector({ app: "platform", getOrigin: () => "https://app.example", getSessionUser: async () => null, writeReport, consumeLimit: async () => true });
    const report = createErrorReport(new Error("private"), { ...context, operation: "browser_uncaught" });
    expect((await collector(requestFor(report))).status).toBe(204);
    expect(writeReport.mock.calls[0]?.[1]).toBeUndefined();
    expect((await collector(requestFor({ ...report, app: "admin" }))).status).toBe(400);
    const otherHost = new Request("https://other.example/api/error-reports", { method: "POST", headers: { origin: "https://app.example", "Content-Type": "application/json" }, body: JSON.stringify(report) });
    expect((await collector(otherHost)).status).toBe(403);
  });

  it("trusts the public Host header over the server's own URL, as when it runs behind the proxy", async () => {
    const writeReport = vi.fn().mockResolvedValue("issue-id");
    const collector = createErrorReportCollector({ app: "platform", getOrigin: () => "https://app.example", getSessionUser: async () => null, writeReport, consumeLimit: async () => true });
    const report = createErrorReport(new Error("private"), { ...context, operation: "browser_uncaught" });
    const behindProxy = (host: string): Request => new Request("http://localhost:3001/api/error-reports", { method: "POST", headers: { origin: "https://app.example", host, "Content-Type": "application/json" }, body: JSON.stringify(report) });
    expect((await collector(behindProxy("app.example"))).status).toBe(204);
    expect((await collector(behindProxy("APP.example"))).status).toBe(204);
    expect((await collector(behindProxy("other.example"))).status).toBe(403);
    expect((await collector(behindProxy("app.example:3001"))).status).toBe(403);
    expect(writeReport).toHaveBeenCalledTimes(2);
  });

  it("enforces byte limits on streamed bodies without content-length", async () => {
    const { collector, writeReport } = fixture();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(9_000))); controller.close(); } });
    const request = new Request("https://app.example/api/error-reports", { method: "POST", headers: { origin: "https://app.example", "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect((await collector(request)).status).toBe(413);
    expect(writeReport).not.toHaveBeenCalled();
  });
});
