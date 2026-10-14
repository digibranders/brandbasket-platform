import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkHuman, turnstileSiteKey } from "./turnstile-request";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9" })) }));

function form(token?: string): FormData {
  const data = new FormData();
  if (token !== undefined) data.set("cf-turnstile-response", token);
  return data;
}

function siteverify(body: Record<string, unknown>): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
  vi.stubEnv("TURNSTILE_SECRET", "secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkHuman", () => {
  it("lets every form through when Turnstile is not set up on this deployment", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    const fetchFn = siteverify({ success: true });
    expect(await checkHuman(form(), "sign_in", fetchFn)).toEqual({ ok: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes a form whose token Cloudflare confirms for that form", async () => {
    const fetchFn = siteverify({ success: true, action: "sign_in", hostname: "app.firstfold.io" });
    expect(await checkHuman(form("tok"), "sign_in", fetchFn)).toEqual({ ok: true });
    const sent = new URLSearchParams(String((vi.mocked(fetchFn).mock.calls[0]?.[1] as RequestInit).body));
    expect(sent.get("remoteip")).toBe("203.0.113.9");
  });

  it("asks the person to wait when the form carries no token yet", async () => {
    const result = await checkHuman(form(), "sign_in", siteverify({ success: true }));
    expect(result).toEqual({ ok: false, message: expect.stringContaining("wait a moment") });
  });

  it("refuses a token solved for another form, with a message that points the person at a reload", async () => {
    const fetchFn = siteverify({ success: true, action: "join", hostname: "app.firstfold.io" });
    expect(await checkHuman(form("tok"), "sign_in", fetchFn)).toEqual({ ok: false, message: expect.stringContaining("Reload the page") });
  });

  it("does not log the token or the secret when it refuses", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await checkHuman(form("super-secret-token"), "sign_in", siteverify({ success: false }));
    expect(JSON.stringify(logged.mock.calls)).not.toContain("super-secret-token");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret\"");
    logged.mockRestore();
  });
});

describe("turnstileSiteKey", () => {
  it("is the public key when the check is on, and null when it is off", () => {
    expect(turnstileSiteKey()).toBe("site-key");
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    expect(turnstileSiteKey()).toBeNull();
  });
});
