import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

/*
 * Google service account sign-in for the Analytics Data API, with no Google library: a signed JWT is traded for a short-lived
 * access token (https://developers.google.com/identity/protocols/oauth2/service-account#httprequest). The key file is read from
 * the path in GA4_SERVICE_ACCOUNT_JSON. Its contents never go into the code, the database or a log.
 */

export const ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_LIFETIME_SECONDS = 3600;
/** A token is renewed this long before it ends, so a slow request never carries an expired one. */
const RENEW_MARGIN_MS = 60_000;

const accountSchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email(),
  private_key: z.string().min(1).includes("PRIVATE KEY"),
  token_uri: z.url({ protocol: /^https$/ }).default("https://oauth2.googleapis.com/token"),
});
export type ServiceAccount = z.output<typeof accountSchema>;

export class ServiceAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceAccountError";
  }
}

/** Reads and checks the key file. The error names the problem and the path, never the key. */
export async function loadServiceAccount(path: string | undefined): Promise<ServiceAccount> {
  if (!path?.trim()) throw new ServiceAccountError("GA4_SERVICE_ACCOUNT_JSON is not set. It must be the path of the service account's key file.");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new ServiceAccountError(`The service account key file ${path} cannot be read.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ServiceAccountError(`The service account key file ${path} is not JSON.`);
  }
  const parsed = accountSchema.safeParse(json);
  if (!parsed.success) throw new ServiceAccountError(`The service account key file ${path} is not a Google service account key (${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}).`);
  return parsed.data;
}

const base64Url = (value: string | Buffer): string => Buffer.from(value).toString("base64url");

/** The signed request for an access token. */
export function signAssertion(account: ServiceAccount, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({ iss: account.client_email, scope: ANALYTICS_READONLY_SCOPE, aud: account.token_uri, iat: issuedAt, exp: issuedAt + TOKEN_LIFETIME_SECONDS }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${base64Url(signature)}`;
}

export type TokenSource = () => Promise<string>;

/** Hands out an access token, asking Google for a new one only when the last is about to end. */
export function createTokenSource(account: ServiceAccount, options: { readonly fetch?: typeof fetch; readonly now?: () => Date } = {}): TokenSource {
  const fetchFn = options.fetch ?? fetch;
  const clock = options.now ?? (() => new Date());
  let cached: { readonly token: string; readonly expiresAt: number } | null = null;
  return async () => {
    const now = clock();
    if (cached !== null && cached.expiresAt - RENEW_MARGIN_MS > now.getTime()) return cached.token;
    const response = await fetchFn(account.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signAssertion(account, now) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new ServiceAccountError(`Google refused the service account sign-in (HTTP ${response.status}).`);
    const body = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await response.json());
    cached = { token: body.access_token, expiresAt: now.getTime() + body.expires_in * 1000 };
    return body.access_token;
  };
}
