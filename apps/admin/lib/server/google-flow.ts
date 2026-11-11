import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/*
 * The few minutes between pressing Connect and Google sending staff back: the state, the PKCE verifier and which sign-in
 * this is travel in a host-only cookie, signed with a key derived from the auth secret so it cannot be forged or swapped.
 */

export const GOOGLE_FLOW_COOKIE = "bb_google_flow";
export const GOOGLE_FLOW_SECONDS = 600;

const flowSchema = z.object({ purpose: z.enum(["read", "write"]), state: z.string().min(16), verifier: z.string().min(32), staffId: z.string().min(1), expiresAt: z.number() });
export type GoogleFlow = z.output<typeof flowSchema>;

const sign = (secret: string, payload: string): Buffer =>
  createHmac("sha256", Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "brandbasket google flow v1", 32))).update(payload).digest();

export function packGoogleFlow(secret: string, flow: GoogleFlow): string {
  const payload = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${payload}.${sign(secret, payload).toString("base64url")}`;
}

/** The flow, or null when the cookie is missing, altered, expired, or for a different staff member. */
export function unpackGoogleFlow(secret: string, cookie: string | undefined, staffId: string, now: Date): GoogleFlow | null {
  const [payload, signature] = cookie?.split(".") ?? [];
  if (payload === undefined || signature === undefined) return null;
  const expected = sign(secret, payload);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = flowSchema.safeParse(json);
  if (!parsed.success || parsed.data.expiresAt <= now.getTime() || parsed.data.staffId !== staffId) return null;
  return parsed.data;
}
