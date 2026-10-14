import "server-only";
import { isHoneypotFilled, parseLeadForm, type LeadInput } from "@firstfold/shared/lib/lead-form";
import { businessDetails } from "@firstfold/shared/lib/site-config";
import { LEAD_REQUEST_FIELDS, leadApiRequestSchema, type LeadApiResponse } from "@/lib/leads-api";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import { hasValidWebsiteToken } from "./website-api-auth";

/** Eight fields of at most 2,000 characters each fit well inside this, even as multi-byte UTF-8. */
const MAX_BODY_BYTES = 16 * 1024;

const TOO_MANY_MESSAGE = "You've sent this a few times already. Give us a little while, or email us directly.";
const PROBLEM_MESSAGE = `Something went wrong on our end. Try again in a moment, or email us at ${businessDetails.email}.`;

export type LeadRecordOutcome = "recorded" | "limited" | "failed";

export interface LeadIntakeDeps {
  /** The shared secret, or null when LEADS_API_TOKEN is not configured (the route then refuses everything). */
  readonly token: string | null;
  /** Rate-limits, stores the lead and tells the team. `noticeVersion` is null from a website that does not send one yet. */
  readonly record: (input: LeadInput, clientIp: string, noticeVersion: string | null) => Promise<LeadRecordOutcome>;
}

function reply(status: number, body: LeadApiResponse | { readonly error: string }): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * `POST /api/leads`: an enquiry from the Get started form, forwarded by the website's server. Checks, in order:
 * 1. POST, or 405
 * 2. a configured token, or 503, and a matching `Authorization: Bearer` header, or 401
 * 3. a JSON content type, or 415
 * 4. a body within 16 KB, or 413, holding the agreed shape, or 400
 * 5. the form's own validation, or 422 with the message and field to show
 * Then a filled honeypot gets the same answer as a real enquiry and nothing is stored; otherwise the lead is recorded,
 * or refused with 429 by the rate limits, or reported with 500.
 */
export async function handleLeadRequest(request: Request, deps: LeadIntakeDeps): Promise<Response> {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  if (deps.token === null) {
    console.error("LEADS_API_TOKEN is not set, so the website cannot send enquiries.");
    return reply(503, { error: "Enquiries are not being accepted right now." });
  }
  if (!hasValidWebsiteToken(request, deps.token)) return reply(401, { error: "Not authorised." });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(415, { error: "Send JSON." });
  }

  let raw: unknown;
  try {
    const bytes = await readLimitedBody(request.body, MAX_BODY_BYTES);
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return reply(413, { error: "Request too large." });
    return reply(400, { error: "The body is not valid JSON." });
  }

  const leadRequest = leadApiRequestSchema.safeParse(raw);
  if (!leadRequest.success) return reply(400, { error: "The body is not a lead request." });

  const formData = new FormData();
  for (const field of LEAD_REQUEST_FIELDS) formData.set(field, leadRequest.data.fields[field]);

  const parsed = parseLeadForm(formData);
  if (!parsed.success) {
    return reply(422, { status: "error", message: parsed.message, field: parsed.field });
  }
  const sent: LeadApiResponse = { status: "sent", name: parsed.data.name, email: parsed.data.email };
  // A bot gets the same answer as a person, so it learns nothing. Nothing is stored and nobody is emailed.
  if (isHoneypotFilled(formData)) return reply(200, sent);

  const outcome = await deps.record(parsed.data, leadRequest.data.clientIp, leadRequest.data.noticeVersion ?? null);
  switch (outcome) {
    case "recorded":
      return reply(200, sent);
    case "limited":
      return reply(429, { status: "error", message: TOO_MANY_MESSAGE, field: null });
    case "failed":
      return reply(500, { status: "error", message: PROBLEM_MESSAGE, field: null });
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled lead outcome: ${String(unhandled)}`);
    }
  }
}
