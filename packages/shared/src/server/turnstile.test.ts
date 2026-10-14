import { describe, expect, it, vi } from "vitest";
import { resolveTurnstile, verifyTurnstile, TURNSTILE_RESPONSE_FIELD, type TurnstileConfig } from "./turnstile";

const KEYS = { TURNSTILE_SITE_KEY: "0x4AAAAA-site", TURNSTILE_SECRET: "0x4AAAAA-secret" };
const CONFIG: TurnstileConfig = {
  siteKey: "0x4AAAAA-site",
  secret: "0x4AAAAA-secret",
  hostnames: ["app.firstfold.io"],
  testing: false,
};

function siteverify(body: Record<string, unknown>, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("resolveTurnstile", () => {
  it("is on in production when both keys are set, with the Firstfold hostnames by default", () => {
    const config = resolveTurnstile({ NODE_ENV: "production", ...KEYS });
    expect(config).toMatchObject({ siteKey: "0x4AAAAA-site", secret: "0x4AAAAA-secret" });
    expect(config?.hostnames).toEqual(["firstfold.io", "www.firstfold.io", "app.firstfold.io", "admin.firstfold.io"]);
  });

  it("accepts a Fynix server's own dashboard and console hosts by default, and none of Firstfold's", () => {
    const config = resolveTurnstile({
      NODE_ENV: "production", ...KEYS, PLATFORM_BRAND: "fynix",
      APP_ORIGIN: "https://app.fynix.digital", ADMIN_ORIGIN: "https://staff.fynix.digital:8443",
    });
    expect(config?.hostnames).toEqual(["app.fynix.digital", "staff.fynix.digital"]);
    expect(JSON.stringify(config?.hostnames)).not.toMatch(/firstfold/);
  });

  it("takes the hostnames to accept from TURNSTILE_HOSTNAMES", () => {
    const config = resolveTurnstile({ NODE_ENV: "production", ...KEYS, TURNSTILE_HOSTNAMES: " app.firstfold.io , admin.firstfold.io ,," });
    expect(config?.hostnames).toEqual(["app.firstfold.io", "admin.firstfold.io"]);
  });

  it("is off when either key is missing or blank, so a deploy without them keeps working", () => {
    expect(resolveTurnstile({ NODE_ENV: "production" })).toBeNull();
    expect(resolveTurnstile({ NODE_ENV: "production", TURNSTILE_SITE_KEY: "x" })).toBeNull();
    expect(resolveTurnstile({ NODE_ENV: "production", TURNSTILE_SITE_KEY: "x", TURNSTILE_SECRET: "  " })).toBeNull();
  });

  it("is off in development even with keys set, because the real widget refuses localhost", () => {
    expect(resolveTurnstile({ NODE_ENV: "development", ...KEYS })).toBeNull();
    expect(resolveTurnstile({ NODE_ENV: "test", ...KEYS })).toBeNull();
  });

  it("can be switched on in development with Cloudflare's test keys, to try the widget locally", () => {
    const config = resolveTurnstile({ NODE_ENV: "development", ...KEYS, TURNSTILE_ENABLE_IN_DEVELOPMENT: "true" });
    expect(config).toMatchObject({ testing: true });
  });

  it("never lets the development switch loosen the check in production", () => {
    const config = resolveTurnstile({ NODE_ENV: "production", ...KEYS, TURNSTILE_ENABLE_IN_DEVELOPMENT: "true" });
    expect(config).toMatchObject({ testing: false });
  });
});

describe("verifyTurnstile", () => {
  const base = { config: CONFIG, action: "sign_in", remoteIp: "203.0.113.9" } as const;

  it("accepts a token Cloudflare confirms for this action and one of our hostnames", async () => {
    const fetchFn = siteverify({ success: true, action: "sign_in", hostname: "app.firstfold.io" });
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn })).toEqual({ ok: true });
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("secret")).toBe("0x4AAAAA-secret");
    expect(sent.get("response")).toBe("tok");
    expect(sent.get("remoteip")).toBe("203.0.113.9");
    expect(new Headers(init.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
  });

  it("refuses a missing, empty or oversized token without calling Cloudflare", async () => {
    const fetchFn = siteverify({ success: true });
    for (const token of [undefined, "", "x".repeat(2049)]) {
      expect(await verifyTurnstile({ ...base, token, fetchFn })).toEqual({ ok: false, reason: "missing" });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a token Cloudflare rejects", async () => {
    const fetchFn = siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn })).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a token solved for another form, so one solve cannot be used everywhere", async () => {
    const fetchFn = siteverify({ success: true, action: "join", hostname: "app.firstfold.io" });
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn })).toEqual({ ok: false, reason: "wrong-action" });
  });

  it("refuses a token solved on another site", async () => {
    const fetchFn = siteverify({ success: true, action: "sign_in", hostname: "evil.example" });
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn })).toEqual({ ok: false, reason: "wrong-hostname" });
  });

  it("says the check could not be made, rather than passing, when Cloudflare is unreachable or answers badly", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn: down })).toEqual({ ok: false, reason: "unavailable" });
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn: siteverify({}, 500) })).toEqual({ ok: false, reason: "unavailable" });
    const notJson = vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn: notJson })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("accepts Cloudflare's answer for its test keys when trying the widget in development", async () => {
    // Cloudflare's test secret answers any token with hostname example.com and no action.
    const fetchFn = siteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
    expect(await verifyTurnstile({ ...base, config: { ...CONFIG, testing: true }, token: "tok", fetchFn })).toEqual({ ok: true });
  });

  it("does not take a test-key answer in production, where a bot could not be told from a person", async () => {
    const fetchFn = siteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
    expect(await verifyTurnstile({ ...base, token: "tok", fetchFn })).toEqual({ ok: false, reason: "wrong-action" });
  });

  it("names the form field the widget fills in", () => {
    expect(TURNSTILE_RESPONSE_FIELD).toBe("cf-turnstile-response");
  });
});
