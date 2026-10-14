import "server-only";
import { findDirectoryVisitor, touchDirectoryVisitor, upsertDirectoryVisitor, type ContributionConsent } from "@fynix/db";
import { phoneHint } from "@fynix/shared/lib/appointments/booking-form";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import type { VisitorSessionPayload } from "@/lib/directory-api";
import { getStaffDb } from "./db";
import { bookingOtpSecret } from "./env";
import type { VisitorIdentity } from "./directory-fields";
import { recordContributionConsent } from "./visitor-consent";
import { issueVisitorToken, verifyVisitorToken } from "./visitor-token";

/**
 * Website visitor accounts (docs/superpowers/specs/2026-10-09-visitor-account-design.md). A number that has just been
 * proven by a texted code gets an account, and the website keeps the signed token this module issues; from then on the
 * same browser reviews, comments and enquires under that number with no further code. The token is the proof, so only
 * code that has just checked a real code may call `startVisitorSession`.
 */

export type VisitorSession = VisitorSessionPayload;

export interface ResolvedVisitor {
  readonly id: string;
  /** The name and verified number the visitor's requests are made under. */
  readonly identity: VisitorIdentity;
  /** A renewed token (the thirty days start again) and the labels the header shows. */
  readonly session: VisitorSession;
}

function sessionFor(visitor: { readonly id: string; readonly name: string; readonly phone: string }, now: Date): VisitorSession {
  return { token: issueVisitorToken(visitor.id, now, bookingOtpSecret()), name: visitor.name, phoneHint: phoneHint(visitor.phone) };
}

/**
 * Opens (or finds) the account of a number whose code was just confirmed and returns its session. Never throws: a
 * failure here must not undo the review or comment that was just published, so it is logged and the visitor simply has
 * to confirm a code again next time. `consent` is what they agreed to on the form, kept against the account.
 */
export async function startVisitorSession(phone: string, name: string, now: Date, consent?: ContributionConsent): Promise<VisitorSession | undefined> {
  try {
    const db = getStaffDb();
    const visitor = await upsertDirectoryVisitor(db, { phone, name, now });
    await recordContributionConsent(db, visitor.id, consent);
    return sessionFor(visitor, now);
  } catch (error) {
    console.error("Could not open a visitor account after a confirmed code.", errorLogInfo(error));
    return undefined;
  }
}

/** The visitor a token names, or null when it is forged, expired, or names an account that is gone. */
export async function resolveVisitor(token: string, now: Date): Promise<ResolvedVisitor | null> {
  const id = verifyVisitorToken(token, now, bookingOtpSecret());
  if (id === null) return null;
  const db = getStaffDb();
  const visitor = await findDirectoryVisitor(db, id);
  if (visitor === null) return null;
  await touchDirectoryVisitor(db, id, now);
  return { id, identity: { name: visitor.name, phone: visitor.phone }, session: sessionFor(visitor, now) };
}
