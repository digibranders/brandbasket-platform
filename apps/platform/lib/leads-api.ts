/**
 * The contract between the marketing website and the platform for the Get started form. The website's server posts
 * each enquiry here instead of touching the database, so the website holds no database credentials at all.
 *
 * The website repository keeps an identical copy of this file (lib/leads-api.ts). Change both together.
 */
import { z } from "zod";

/** The header carrying the shared secret, as `Bearer <LEADS_API_TOKEN>`. */
export const LEADS_API_AUTH_HEADER = "authorization";

/** Both sides refuse a token shorter than this. Generate one with `openssl rand -base64 32`. */
export const LEADS_API_TOKEN_MIN_LENGTH = 32;

/** Every form field the website forwards, including the hidden honeypot. */
export const LEAD_REQUEST_FIELDS = [
  "name",
  "businessName",
  "email",
  "phone",
  "phoneCountry",
  "businessType",
  "message",
  "website",
] as const;

export type LeadRequestField = (typeof LEAD_REQUEST_FIELDS)[number];

/** The longest value accepted per field. The form's own limits are lower; this only bounds the request. */
const MAX_FIELD_LENGTH = 2000;
/** A client address as the website read it; anything longer is not an address. */
const MAX_CLIENT_IP_LENGTH = 64;
/** The longest notice version label the platform keeps (consent_records.notice_version). */
const MAX_NOTICE_VERSION_LENGTH = 40;

export const leadApiRequestSchema = z.object({
  fields: z.object(
    Object.fromEntries(LEAD_REQUEST_FIELDS.map((field) => [field, z.string().max(MAX_FIELD_LENGTH)])) as Record<
      LeadRequestField,
      z.ZodString
    >,
  ),
  /** The visitor's address, which only the website's server can see. Trusted because the request is authenticated. */
  clientIp: z.string().min(1).max(MAX_CLIENT_IP_LENGTH),
  /**
   * Which version of the Terms and Privacy Notice was on the page when the visitor sent the form. Kept as proof of the
   * notice they saw (DPDP Act s.5, r.3). Optional while the website catches up with the platform; the platform then
   * makes it required.
   */
  noticeVersion: z.string().min(1).max(MAX_NOTICE_VERSION_LENGTH).optional(),
});

export type LeadApiRequest = z.infer<typeof leadApiRequestSchema>;

const LEAD_FORM_FIELDS = ["name", "businessName", "email", "phone", "phoneCountry", "businessType", "message"] as const;

export const leadApiResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("sent"), name: z.string(), email: z.string() }),
  z.object({
    status: z.literal("error"),
    message: z.string(),
    /** The field to point the visitor at, or null for a problem with the whole submission. */
    field: z.enum(LEAD_FORM_FIELDS).nullable(),
  }),
]);

export type LeadApiResponse = z.infer<typeof leadApiResponseSchema>;
