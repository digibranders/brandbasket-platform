import { describe, expect, it } from "vitest";
import { browserFamily, createErrorReport, normalizeErrorRoute, errorReportSchema, safeSourceFrames } from "./error-report";

describe("automatic error privacy contract", () => {
  it("retains only allowlisted classification and source coordinates", () => {
    const error = new TypeError("patient Alice, bearer secret, billing query");
    error.stack = "TypeError: Alice\n at render (https://app.example/_next/static/chunks/abcdef12.js?token=secret:12:8)\n at Alice (/patients/Alice-secret.ts:3:4)";
    const report = createErrorReport(error, { app: "platform", operation: "server_render", route: "/appointments/alice?token=secret", release: "abcdef123" });
    expect(report.errorClass).toBe("TypeError");
    expect(report.route).toBe("/appointments/[id]");
    expect(report.frames).toEqual([{ file: "abcdef12.js", line: 12, column: 8 }]);
    expect(JSON.stringify(report)).not.toMatch(/Alice|patient |bearer|secret|billing query|token/);
  });

  it("rejects unexpected properties instead of accepting user identity or raw errors", () => {
    const report = createErrorReport(new Error("private"), { app: "platform", operation: "browser_uncaught", route: "/" });
    expect(errorReportSchema.safeParse({ ...report, userId: "someone-else" }).success).toBe(false);
    expect(errorReportSchema.safeParse({ ...report, message: "patient" }).success).toBe(false);
    expect(errorReportSchema.safeParse({ ...report, route: "/appointments/alice" }).success).toBe(false);
    expect(errorReportSchema.safeParse({ ...report, frames: [{ file: "alice@example.com", line: 1, column: 2 }] }).success).toBe(false);
  });

  it("redacts unfamiliar routes, custom error classes, function names and releases", () => {
    const error = new Error("secret");
    error.name = "AlicePrivateError";
    error.stack = "Error: secret\n at alice@example.com (/app/page.tsx:4:5)";
    const report = createErrorReport(error, { app: "admin", operation: "error_boundary", route: "/clients/Alice%40example.com/private", release: "token-private" });
    expect(report.errorClass).toBe("UnknownError");
    expect(report.route).toBe("/clients/[id]/[id]");
    expect(report.release).toBe("unknown");
    expect(report.frames).toEqual([{ file: "page.tsx", line: 4, column: 5 }]);
    expect(normalizeErrorRoute("https://alice:password@example.com/clients/secret?email=alice")).toBe("/[id]");
  });

  it("caps frames and recognizes browser family without retaining the user agent", () => {
    expect(safeSourceFrames(Array.from({ length: 30 }, () => " at fn (/app/page.tsx:4:5)").join("\n"))).toHaveLength(8);
    expect(browserFamily("Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36")).toBe("Chrome");
    expect(browserFamily("Mozilla/5.0 Chrome/145.0.0.0 Edg/145")).toBe("Edge");
    expect(browserFamily("private arbitrary agent")).toBe("Other");
  });

  it("does not throw on hostile error properties", () => {
    const error = new Error("private");
    Object.defineProperty(error, "stack", { get: () => { throw new Error("private getter"); } });
    expect(() => createErrorReport(error, { app: "platform", operation: "server_action", route: "/" })).not.toThrow();
  });
});
