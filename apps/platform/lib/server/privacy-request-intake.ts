import "server-only";
import { randomUUID } from "node:crypto";
import { OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import { emailHint } from "@/lib/email-hint";
import {
  contributionDeletionRequestSchema,
  ownContributionsRequestSchema,
  privacyRequestConfirmRequestSchema,
  privacyRequestOtpRequestSchema,
  type ContributionDeletionResponse,
  type OwnContributionsResponse,
  type PrivacyRequestConfirmResponse,
  type PrivacyRequestError,
  type PrivacyRequestField,
  type PrivacyRequestOtpResponse,
} from "@/lib/privacy-requests-api";
import type {
  ContributionDeletionInput,
  ContributionDeletionOutcome,
  OwnContributionsOutcome,
  PrivacyRequestConfirmOutcome,
  PrivacyRequestOtpOutcome,
} from "./privacy-requests";
import { parsePrivacyRequestFields, requestAbout, type PrivacyRequestInput } from "./privacy-request-fields";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import { hasValidWebsiteToken } from "./website-api-auth";

/**
 * The HTTP side of the privacy request routes (/api/privacy-requests/*), called server-to-server by the marketing website
 * with `Authorization: Bearer <LEADS_API_TOKEN>` (lib/privacy-requests-api.ts is the contract). Request checking and
 * outcome-to-status mapping only; the work is injected, so it is tested without a database. Every route checks, in order:
 * the method (405), a configured token (503) and a matching bearer header (401), a JSON content type (415), a body within
 * the limit (413), the contract's shape (400), the honeypot (a filled one gets a convincing success and nothing happens)
 * and the person's own input (422).
 */

const MAX_FORM_BODY_BYTES = 24 * 1024;
const MAX_CONFIRM_BODY_BYTES = 4 * 1024;

const LIMITED_MESSAGE = "You've sent a few of these already. Please try again later.";
const FAILED_MESSAGE = "Something went wrong. Please try again in a moment.";
const UNAVAILABLE_MESSAGE = "We can't send a code right now. Please email us instead.";
const EXPIRED_MESSAGE = "That code has expired. Please ask for a new one.";
const SIGNED_OUT_MESSAGE = "Your sign-in has run out, so we can't tell which reviews are yours. Please email us instead.";

function reply(status: number, body: object): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(status: number, code: PrivacyRequestError["code"], message: string, field: PrivacyRequestField | null = null): Response {
  const body: PrivacyRequestError = { status: "error", code, message, field };
  return reply(status, body);
}

function refuseUnauthorised(request: Request, token: string | null): Response | null {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  if (token === null) {
    console.error("LEADS_API_TOKEN is not set, so the website cannot reach the privacy request routes.");
    return reply(503, { error: "Privacy requests are not available right now." });
  }
  if (!hasValidWebsiteToken(request, token)) return reply(401, { error: "Not authorised." });
  return null;
}

type JsonBody = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly response: Response };

async function readJsonBody(request: Request, limit: number): Promise<JsonBody> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: reply(415, { error: "Send JSON." }) };
  }
  try {
    const bytes = await readLimitedBody(request.body, limit);
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { ok: false, response: reply(413, { error: "Request too large." }) };
    return { ok: false, response: reply(400, { error: "The body is not valid JSON." }) };
  }
}

/** A meaningless but plausible hint for the honeypot's fake success, from whatever address the bot sent. */
function fakeEmailHint(rawEmail: string): string {
  return emailHint(rawEmail.trim().toLowerCase());
}

export function otpResponse(outcome: PrivacyRequestOtpOutcome): Response {
  switch (outcome.kind) {
    case "otp_sent": {
      const body: PrivacyRequestOtpResponse = { status: "otp_sent", otpId: outcome.otpId, expiresInSeconds: outcome.expiresInSeconds, emailHint: outcome.emailHint };
      return reply(200, body);
    }
    case "unavailable":
      return failure(503, "unavailable", UNAVAILABLE_MESSAGE);
    case "limited":
      return failure(429, "limited", LIMITED_MESSAGE);
    case "failed":
      return failure(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled privacy request code outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function confirmResponse(outcome: PrivacyRequestConfirmOutcome): Response {
  switch (outcome.kind) {
    case "received": {
      const body: PrivacyRequestConfirmResponse = { status: "received", reference: outcome.reference, dueAt: outcome.dueAt.toISOString() };
      return reply(200, body);
    }
    case "expired":
      return failure(410, "expired", EXPIRED_MESSAGE);
    case "too_many_attempts":
      return failure(429, "too_many_attempts", outcome.message);
    case "wrong_code":
      return failure(422, "wrong_code", outcome.message, "code");
    case "limited":
      return failure(429, "limited", LIMITED_MESSAGE);
    case "failed":
      return failure(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled privacy request confirmation outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

export interface PrivacyRequestOtpIntakeDeps {
  readonly token: string | null;
  /** The marketing website's origin: the only one a request's `about` page may be on. */
  readonly websiteOrigin: string;
  readonly requestOtp: (input: PrivacyRequestInput, clientIp: string, now: Date) => Promise<PrivacyRequestOtpOutcome>;
  readonly now: () => Date;
}

/** `POST /api/privacy-requests/otp`: a request, held until the code emailed to the address on it is confirmed. */
export async function handlePrivacyRequestOtp(request: Request, deps: PrivacyRequestOtpIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_FORM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = privacyRequestOtpRequestSchema.safeParse(body.value);
  if (!parsed.success) return reply(400, { error: "The body is not a privacy request." });

  // A bot gets the same answer as a person, so it learns nothing. Nothing is stored or sent.
  if (parsed.data.website.trim() !== "") {
    return otpResponse({ kind: "otp_sent", otpId: randomUUID(), expiresInSeconds: OTP_TTL_SECONDS, emailHint: fakeEmailHint(parsed.data.email) });
  }

  const about = requestAbout(parsed.data.about, deps.websiteOrigin);
  if (about === null) return reply(400, { error: "The page a request is about must be on the website." });
  const fields = parsePrivacyRequestFields(parsed.data, about);
  if (!fields.success) return failure(422, "invalid", fields.message, fields.field);
  return otpResponse(await deps.requestOtp(fields.data, parsed.data.clientIp, deps.now()));
}

export interface PrivacyRequestConfirmIntakeDeps {
  readonly token: string | null;
  readonly confirmOtp: (otpId: string, code: string, clientIp: string, now: Date) => Promise<PrivacyRequestConfirmOutcome>;
  readonly now: () => Date;
}

/** `POST /api/privacy-requests/confirm`: the code from the email, which files the request it was holding. */
export async function handlePrivacyRequestConfirm(request: Request, deps: PrivacyRequestConfirmIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_CONFIRM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = privacyRequestConfirmRequestSchema.safeParse(body.value);
  if (!parsed.success) return reply(400, { error: "The body is not a privacy request confirmation." });
  const { otpId, code, clientIp } = parsed.data;
  return confirmResponse(await deps.confirmOtp(otpId, code, clientIp, deps.now()));
}

export function deletionResponse(outcome: ContributionDeletionOutcome): Response {
  switch (outcome.kind) {
    case "deleted": {
      const body: ContributionDeletionResponse = { status: "deleted", reference: outcome.reference };
      return reply(200, body);
    }
    case "not_found": {
      const body: ContributionDeletionResponse = { status: "not_found" };
      return reply(200, body);
    }
    case "failed":
      return failure(500, "failed", FAILED_MESSAGE);
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled contribution deletion outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

export interface ContributionDeletionIntakeDeps {
  readonly token: string | null;
  /** The phone a visitor token proves, or null when the token is forged, expired or names an account that is gone. */
  readonly resolveVisitorPhone: (token: string, now: Date) => Promise<string | null>;
  readonly requestDeletion: (input: ContributionDeletionInput, now: Date) => Promise<ContributionDeletionOutcome>;
  readonly now: () => Date;
}

/**
 * `POST /api/privacy-requests/contribution`: a recognised visitor deleting one review or comment of theirs. It is deleted at
 * once; a stale token is `signed_out`.
 */
export async function handleContributionDeletion(request: Request, deps: ContributionDeletionIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_CONFIRM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = contributionDeletionRequestSchema.safeParse(body.value);
  if (!parsed.success) return reply(400, { error: "The body is not a deletion request." });
  const { target, visitorToken, noticeVersion } = parsed.data;
  const now = deps.now();

  const phone = await deps.resolveVisitorPhone(visitorToken, now);
  if (phone === null) return failure(401, "signed_out", SIGNED_OUT_MESSAGE);
  return deletionResponse(await deps.requestDeletion({ target, phone, noticeVersion: noticeVersion ?? null }, now));
}

export interface OwnContributionsIntakeDeps {
  readonly token: string | null;
  /** The phone a visitor token proves, or null when the token is forged, expired or names an account that is gone. */
  readonly resolveVisitorPhone: (token: string, now: Date) => Promise<string | null>;
  readonly listMine: (phone: string, reviewIds: readonly string[]) => Promise<OwnContributionsOutcome>;
  readonly now: () => Date;
}

/** `POST /api/privacy-requests/contribution/mine`: which of a page's reviews and comments a remembered visitor wrote. */
export async function handleOwnContributions(request: Request, deps: OwnContributionsIntakeDeps): Promise<Response> {
  const refused = refuseUnauthorised(request, deps.token);
  if (refused !== null) return refused;
  const body = await readJsonBody(request, MAX_CONFIRM_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = ownContributionsRequestSchema.safeParse(body.value);
  if (!parsed.success) return reply(400, { error: "The body is not a list of reviews." });

  const phone = await deps.resolveVisitorPhone(parsed.data.visitorToken, deps.now());
  if (phone === null) return failure(401, "signed_out", SIGNED_OUT_MESSAGE);
  const outcome = await deps.listMine(phone, parsed.data.reviewIds);
  if (outcome.kind === "failed") return failure(500, "failed", FAILED_MESSAGE);
  const answer: OwnContributionsResponse = { status: "ok", reviews: [...outcome.reviews], comments: [...outcome.comments] };
  return reply(200, answer);
}
