import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as jose from "jose";
import { verifyCloudflareAccess } from "./cloudflare-access";

const ISSUER = "https://team.cloudflareaccess.com";
const AUDIENCE = "0192f3c4-1111-7000-8000-000000000001";
const KEY_ID = "key-test-1";

describe("verifyCloudflareAccess", () => {
  let privateKey: jose.CryptoKey;
  let jwk: jose.JWK;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.REQUIRE_CF_ACCESS;
    delete process.env.CF_ACCESS_AUDIENCE;
    delete process.env.CF_ACCESS_ISSUER;

    const keyPair = await jose.generateKeyPair("RS256");
    privateKey = keyPair.privateKey;
    jwk = await jose.exportJWK(keyPair.publicKey);
    jwk.kid = KEY_ID;
    jwk.alg = "RS256";
  });

  afterEach(() => {
    delete process.env.REQUIRE_CF_ACCESS;
    delete process.env.CF_ACCESS_AUDIENCE;
    delete process.env.CF_ACCESS_ISSUER;
  });

  async function makeToken(options?: {
    issuer?: string;
    audience?: string;
    expirationTime?: string;
    keyId?: string;
    key?: jose.CryptoKey;
  }): Promise<string> {
    const builder = new jose.SignJWT({
      email: "staff@brandbasket.in",
      sub: "staff-1",
    })
      .setProtectedHeader({ alg: "RS256", kid: options?.keyId ?? KEY_ID })
      .setIssuer(options?.issuer ?? ISSUER)
      .setAudience(options?.audience ?? AUDIENCE)
      .setExpirationTime(options?.expirationTime ?? "1h");

    return builder.sign(options?.key ?? privateKey);
  }

  function mockCertsEndpoint(keys: jose.JWK[]): void {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/cdn-cgi/access/certs")) {
        return new Response(JSON.stringify({ keys, public_certs: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });
  }

  describe("when REQUIRE_CF_ACCESS is off", () => {
    it("allows request when header is missing", async () => {
      const request = new Request("http://console.brandbasket.localhost:3199/");
      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(true);
    });

    it("allows request when header is present, without verifying", async () => {
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": "invalid-token" },
      });
      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(true);
    });
  });

  describe("when REQUIRE_CF_ACCESS=1", () => {
    beforeEach(() => {
      process.env.REQUIRE_CF_ACCESS = "1";
      process.env.CF_ACCESS_AUDIENCE = AUDIENCE;
      process.env.CF_ACCESS_ISSUER = ISSUER;
    });

    it("refuses request with 401 when header is missing", async () => {
      const request = new Request("http://console.brandbasket.localhost:3199/");
      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("refuses request with 401 when header is empty", async () => {
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": "   " },
      });
      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("allows request when token is valid and signature matches certs", async () => {
      mockCertsEndpoint([jwk]);
      const token = await makeToken();
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": token },
      });

      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.email).toBe("staff@brandbasket.in");
      }
    });

    it("refuses request with 401 when token is expired", async () => {
      mockCertsEndpoint([jwk]);
      const token = await makeToken({ expirationTime: "-5m" });
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": token },
      });

      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("refuses request with 401 when token has wrong audience", async () => {
      mockCertsEndpoint([jwk]);
      const token = await makeToken({ audience: "different-audience" });
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": token },
      });

      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("refuses request with 401 when token has wrong issuer", async () => {
      mockCertsEndpoint([jwk]);
      const token = await makeToken({ issuer: "https://other-team.cloudflareaccess.com" });
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": token },
      });

      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("refuses request with 401 when token signature cannot be verified", async () => {
      const otherPair = await jose.generateKeyPair("RS256");
      mockCertsEndpoint([jwk]);
      const token = await makeToken({ key: otherPair.privateKey });
      const request = new Request("http://console.brandbasket.localhost:3199/", {
        headers: { "cf-access-jwt-assertion": token },
      });

      const result = await verifyCloudflareAccess(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });
  });
});
