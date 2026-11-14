import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export interface CloudflareAccessOptions {
  readonly required?: boolean;
  readonly audience?: string;
  readonly issuer?: string;
  readonly jwks?: JWTVerifyGetKey;
}

export type CloudflareAccessResult =
  | { readonly ok: true; readonly payload?: JWTPayload; readonly email?: string }
  | { readonly ok: false; readonly status: 401; readonly reason: string };

let cachedIssuer: string | null = null;
let cachedJwks: JWTVerifyGetKey | null = null;

function getRemoteJwks(issuerUrl: string): JWTVerifyGetKey {
  const normalized = issuerUrl.replace(/\/+$/, "");
  if (cachedIssuer !== normalized || !cachedJwks) {
    const certsUrl = new URL(`${normalized}/cdn-cgi/access/certs`);
    cachedJwks = createRemoteJWKSet(certsUrl);
    cachedIssuer = normalized;
  }
  return cachedJwks;
}

/**
 * Verifies the Cloudflare Access JWT assertion on incoming requests.
 *
 * When REQUIRE_CF_ACCESS=1, every request must carry a valid Cf-Access-Jwt-Assertion header signed by the team
 * public keys at /cdn-cgi/access/certs, matching CF_ACCESS_AUDIENCE and CF_ACCESS_ISSUER.
 * When REQUIRE_CF_ACCESS is not 1, the check passes without refusal.
 */
export async function verifyCloudflareAccess(
  request: Request | { headers: Headers },
  options?: CloudflareAccessOptions,
): Promise<CloudflareAccessResult> {
  const isRequired = options?.required ?? (process.env.REQUIRE_CF_ACCESS === "1");
  if (!isRequired) {
    return { ok: true };
  }

  const header = request.headers.get("cf-access-jwt-assertion");
  if (!header || header.trim() === "") {
    return { ok: false, status: 401, reason: "Cloudflare Access assertion is missing." };
  }

  const token = header.trim();
  const audience = options?.audience ?? process.env.CF_ACCESS_AUDIENCE;
  const issuer = options?.issuer ?? process.env.CF_ACCESS_ISSUER;

  if (!audience || !issuer) {
    return { ok: false, status: 401, reason: "Cloudflare Access audience or issuer is not configured." };
  }

  try {
    const keySet = options?.jwks ?? getRemoteJwks(issuer);
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience,
    });

    const email =
      (typeof payload.email === "string" ? payload.email : undefined) ??
      (typeof payload.sub === "string" ? payload.sub : undefined);

    return { ok: true, payload, email };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    return { ok: false, status: 401, reason: message };
  }
}
