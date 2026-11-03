import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/*
 * Signs the Brandbasket Google account in for the nightly job and for go live (plan 62), with no Google library: the
 * authorisation code flow with PKCE (https://developers.google.com/identity/protocols/oauth2/web-server), then refresh tokens.
 * Tokens, the client secret and Google's own messages never go into an error, because errors are stored and shown to staff.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPE = (name: string): string => `https://www.googleapis.com/auth/${name}`;
const IDENTITY_SCOPES = ["openid", "email"] as const;
/** Reading only: the nightly job. A leaked token of this kind cannot change anything. */
export const READ_SCOPES = [SCOPE("webmasters.readonly"), SCOPE("analytics.readonly"), ...IDENTITY_SCOPES] as const;
/** Setting up a site: add it to Search Console, prove the domain, create the Analytics property. Used only at go live. */
export const WRITE_SCOPES = [SCOPE("webmasters"), SCOPE("siteverification"), SCOPE("analytics.edit"), ...IDENTITY_SCOPES] as const;

export type GooglePurpose = "read" | "write";
export const scopesFor = (purpose: GooglePurpose): readonly string[] => (purpose === "read" ? READ_SCOPES : WRITE_SCOPES);

export interface GoogleClientCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Google refused the sign-in for good: the password changed or access was taken away. The connection must be made again. */
export class GoogleAccessLost extends Error {
  constructor(message = "Google no longer accepts this sign-in. Connect the account again.") {
    super(message);
    this.name = "GoogleAccessLost";
  }
}

/** Google could not be reached, or answered something we cannot use. Trying again later may work. */
export class GoogleUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleUnavailable";
  }
}

export function newPkcePair(): { readonly verifier: string; readonly challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export const newState = (): string => randomBytes(24).toString("base64url");

/** The page to send staff to. `prompt=consent` and offline access make Google hand over a refresh token every time. */
export function buildConsentUrl(input: { readonly clientId: string; readonly redirectUri: string; readonly purpose: GooglePurpose; readonly state: string; readonly challenge: string; readonly loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: scopesFor(input.purpose).join(" "),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
  });
  if (input.loginHint !== undefined) params.set("login_hint", input.loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

const tokenReply = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

async function postToken(body: Record<string, string>, fetchFn: typeof fetch): Promise<z.output<typeof tokenReply>> {
  let response: Response;
  try {
    response = await fetchFn(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GoogleUnavailable("Google could not be reached.");
  }
  if (!response.ok) {
    const error = await response.json().then((json: unknown) => (typeof json === "object" && json !== null && "error" in json ? String((json as { error: unknown }).error) : ""), () => "");
    if (error === "invalid_grant") throw new GoogleAccessLost();
    throw new GoogleUnavailable(`Google refused the request (HTTP ${response.status}).`);
  }
  const parsed = tokenReply.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new GoogleUnavailable("Google answered something we could not read.");
  return parsed.data;
}

/** The email in an id token that came straight from Google's token endpoint over TLS, which is why its signature is not checked. */
function emailOfIdToken(idToken: string | undefined): string {
  const payload = idToken?.split(".")[1];
  if (payload === undefined) throw new GoogleUnavailable("Google did not say which account signed in.");
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new GoogleUnavailable("Google did not say which account signed in.");
  }
  const parsed = z.object({ email: z.email(), email_verified: z.literal(true) }).safeParse(claims);
  if (!parsed.success) throw new GoogleUnavailable("Google did not say which account signed in.");
  return parsed.data.email.toLowerCase();
}

export interface ExchangedCode {
  readonly refreshToken: string;
  readonly accountEmail: string;
  readonly scopes: readonly string[];
}

export async function exchangeCode(
  credentials: GoogleClientCredentials,
  input: { readonly code: string; readonly verifier: string; readonly redirectUri: string },
  fetchFn: typeof fetch = fetch,
): Promise<ExchangedCode> {
  const reply = await postToken(
    { grant_type: "authorization_code", code: input.code, code_verifier: input.verifier, redirect_uri: input.redirectUri, client_id: credentials.clientId, client_secret: credentials.clientSecret },
    fetchFn,
  );
  if (reply.refresh_token === undefined) throw new GoogleUnavailable("Google did not hand over a refresh token. Connect again and accept every permission.");
  return { refreshToken: reply.refresh_token, accountEmail: emailOfIdToken(reply.id_token), scopes: (reply.scope ?? "").split(" ").filter((scope) => scope !== "") };
}

export async function refreshAccessToken(
  credentials: GoogleClientCredentials,
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ readonly accessToken: string; readonly expiresInSeconds: number }> {
  const reply = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: credentials.clientId, client_secret: credentials.clientSecret }, fetchFn);
  return { accessToken: reply.access_token, expiresInSeconds: reply.expires_in };
}
