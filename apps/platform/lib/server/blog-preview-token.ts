import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived pass that lets a client's own website show one draft post, for "Preview on my website".
 *
 * Stateless: `<claims>.<signature>`, both base64url. The claims name the business, the post and the expiry; the
 * signature is an HMAC over them with a key derived from the platform's secret. The client site never sees that
 * secret: it forwards the token to `/api/site/posts/preview` together with its own site token, and the platform
 * checks both belong to the same business before returning anything. A leaked link shows one post, for minutes.
 */

/** How long a preview link keeps working after the customer clicks "Preview on my website". */
export const BLOG_PREVIEW_TTL_MS = 30 * 60 * 1000;

/** Separates this key from every other use of the same secret. Bump the version to invalidate every link. */
const KEY_CONTEXT = "firstfold:blog-preview:v1";

export interface BlogPreviewClaims {
  readonly businessId: string;
  readonly postId: string;
}

interface WireClaims {
  readonly b: string;
  readonly p: string;
  /** Expiry, epoch milliseconds. */
  readonly e: number;
}

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(KEY_CONTEXT).digest();
}

function signature(secret: string, encodedClaims: string): Buffer {
  return createHmac("sha256", signingKey(secret)).update(encodedClaims).digest();
}

export function signBlogPreviewToken(secret: string, claims: BlogPreviewClaims, now: Date): string {
  const wire: WireClaims = { b: claims.businessId, p: claims.postId, e: now.getTime() + BLOG_PREVIEW_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(wire)).toString("base64url");
  return `${encoded}.${signature(secret, encoded).toString("base64url")}`;
}

function isWireClaims(value: unknown): value is WireClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.b === "string" &&
    record.b !== "" &&
    typeof record.p === "string" &&
    record.p !== "" &&
    typeof record.e === "number" &&
    Number.isFinite(record.e)
  );
}

/** The claims of a valid, unexpired token, or null for anything else. Never throws on bad input. */
export function verifyBlogPreviewToken(secret: string, token: string, now: Date): BlogPreviewClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, givenSignature] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]+$/.test(givenSignature)) return null;

  const expected = signature(secret, encoded);
  const given = Buffer.from(givenSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isWireClaims(claims) || now.getTime() >= claims.e) return null;
  return { businessId: claims.b, postId: claims.p };
}
