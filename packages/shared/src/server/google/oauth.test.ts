import { describe, expect, it } from "vitest";
import { buildConsentUrl, exchangeCode, GoogleAccessLost, GoogleUnavailable, newPkcePair, READ_SCOPES, refreshAccessToken, WRITE_SCOPES } from "./oauth";

const CREDENTIALS = { clientId: "client-id", clientSecret: "client-secret" };
const jsonReply = (body: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const idToken = (claims: unknown): string => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

describe("consent url", () => {
  const url = new URL(buildConsentUrl({ clientId: "client-id", redirectUri: "https://console.example/api/google/callback", purpose: "read", state: "st", challenge: "ch", loginHint: "a@b.in" }));
  it("asks for offline access with PKCE and only the read scopes", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("login_hint")).toBe("a@b.in");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...READ_SCOPES]);
  });
  it("keeps the write scopes apart from the read ones", () => {
    expect(READ_SCOPES.some((scope) => scope.endsWith("/webmasters") || scope.endsWith("analytics.edit"))).toBe(false);
    expect(WRITE_SCOPES.some((scope) => scope.endsWith("/siteverification"))).toBe(true);
  });
  it("makes a challenge that is the hash of the verifier", () => {
    const { verifier, challenge } = newPkcePair();
    expect(verifier.length).toBeGreaterThan(40);
    expect(challenge).not.toBe(verifier);
  });
});

describe("exchangeCode", () => {
  const input = { code: "c", verifier: "v", redirectUri: "https://console.example/api/google/callback" };
  it("returns the refresh token and the verified account email, lower cased", async () => {
    const result = await exchangeCode(CREDENTIALS, input, jsonReply({ access_token: "a", expires_in: 3600, refresh_token: "r", scope: "x y", id_token: idToken({ email: "Official@Gmail.com", email_verified: true }) }));
    expect(result).toEqual({ refreshToken: "r", accountEmail: "official@gmail.com", scopes: ["x", "y"] });
  });
  it("refuses a reply with no refresh token or no verified email", async () => {
    await expect(exchangeCode(CREDENTIALS, input, jsonReply({ access_token: "a", expires_in: 3600, id_token: idToken({ email: "a@b.in", email_verified: true }) }))).rejects.toBeInstanceOf(GoogleUnavailable);
    await expect(exchangeCode(CREDENTIALS, input, jsonReply({ access_token: "a", expires_in: 3600, refresh_token: "r", id_token: idToken({ email: "a@b.in", email_verified: false }) }))).rejects.toBeInstanceOf(GoogleUnavailable);
  });
  it("never puts Google's message or the secret in an error", async () => {
    const attempt = exchangeCode(CREDENTIALS, input, jsonReply({ error: "invalid_client", error_description: "secret client-secret" }, 401));
    await expect(attempt).rejects.toBeInstanceOf(GoogleUnavailable);
    await expect(attempt).rejects.toThrow(/^Google refused the request \(HTTP 401\)\.$/);
  });
});

describe("refreshAccessToken", () => {
  it("returns the access token and its life", async () => {
    expect(await refreshAccessToken(CREDENTIALS, "r", jsonReply({ access_token: "a", expires_in: 1800 }))).toEqual({ accessToken: "a", expiresInSeconds: 1800 });
  });
  it("treats invalid_grant as a lost sign-in and anything else as trouble to retry", async () => {
    await expect(refreshAccessToken(CREDENTIALS, "r", jsonReply({ error: "invalid_grant" }, 400))).rejects.toBeInstanceOf(GoogleAccessLost);
    await expect(refreshAccessToken(CREDENTIALS, "r", jsonReply({ error: "server" }, 503))).rejects.toBeInstanceOf(GoogleUnavailable);
    await expect(refreshAccessToken(CREDENTIALS, "r", (async () => { throw new Error("down"); }) as typeof fetch)).rejects.toBeInstanceOf(GoogleUnavailable);
  });
});
