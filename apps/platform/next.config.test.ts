import { describe, expect, it, vi } from "vitest";

vi.mock("@payloadcms/next/withPayload", () => ({ withPayload: <T>(config: T): T => config }));
vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig: <T>(config: T): T => config }));

describe("next.config headers", () => {
  it("marks every response noindex, beside the security headers and the script's cache rule", async () => {
    const { default: config } = await import("./next.config");
    const rules = (await config.headers?.()) ?? [];
    const everything = rules.find((rule) => rule.source === "/:path*");
    expect(everything?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    expect(everything?.headers.some((header) => header.key === "X-Frame-Options" || header.key === "Content-Security-Policy")).toBe(true);
    expect(rules.some((rule) => rule.source === "/t/:path*")).toBe(true);
  });
});
