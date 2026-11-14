import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { serverEnvSchema } from "./env";

const BASE_ENV = {
  DATABASE_URL_STAFF: "postgresql://bb_staff:pass@localhost:5432/db",
  DATABASE_URL_PAYLOAD: "postgresql://bb_cms:pass@localhost:5432/cms",
  PAYLOAD_SECRET: "12345678901234567890123456789012",
  BETTER_AUTH_SECRET: "12345678901234567890123456789012",
  ADMIN_ORIGIN: "https://console.brandbasket.in",
  APP_ORIGIN: "https://app.brandbasket.in",
};

describe("serverEnvSchema Cloudflare Access validation", () => {
  it("allows unset REQUIRE_CF_ACCESS", () => {
    const parsed = serverEnvSchema.safeParse(BASE_ENV);
    expect(parsed.success).toBe(true);
  });

  it("allows REQUIRE_CF_ACCESS=0 without audience or issuer", () => {
    const parsed = serverEnvSchema.safeParse({
      ...BASE_ENV,
      REQUIRE_CF_ACCESS: "0",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires CF_ACCESS_AUDIENCE and CF_ACCESS_ISSUER when REQUIRE_CF_ACCESS=1", () => {
    const parsed = serverEnvSchema.safeParse({
      ...BASE_ENV,
      REQUIRE_CF_ACCESS: "1",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("CF_ACCESS_AUDIENCE");
      expect(paths).toContain("CF_ACCESS_ISSUER");
    }
  });

  it("passes when REQUIRE_CF_ACCESS=1 with valid audience and issuer", () => {
    const parsed = serverEnvSchema.safeParse({
      ...BASE_ENV,
      REQUIRE_CF_ACCESS: "1",
      CF_ACCESS_AUDIENCE: "aud-tag-123",
      CF_ACCESS_ISSUER: "https://team.cloudflareaccess.com",
    });
    expect(parsed.success).toBe(true);
  });
});
