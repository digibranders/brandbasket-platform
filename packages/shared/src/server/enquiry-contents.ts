import { RETENTION_PERIODS, recordEnquiryContents, type Database, type EnquiryContentsInput } from "@brandbasket/db";
import { z } from "zod";
import { isEnquiryFormContentsEnabled, type FlagEnv } from "../lib/launch-flags";

/*
 * Storing an enquirer's details from a website form or an ad lead (plan 61, gate G2). Nothing in the product calls this yet:
 * there is no endpoint for client sites to post to. It is the one door such an endpoint must use, so the switch, the
 * validation and the retention date are decided in one place. With ENQUIRY_FORM_CONTENTS_ENABLED off it stores nothing.
 */

export class EnquiryContentsDisabledError extends Error {
  constructor() {
    super("Storing enquirers' details is switched off (ENQUIRY_FORM_CONTENTS_ENABLED). It needs the privacy review first.");
    this.name = "EnquiryContentsDisabledError";
  }
}

const text = (max: number) => z.string().trim().max(max).nullish();

const contentsSchema = z
  .object({
    businessId: z.uuid(),
    kind: z.enum(["form", "ad_lead"]),
    source: text(120),
    name: text(200),
    phone: text(40),
    email: z.email().max(320).nullish(),
    message: text(5000),
    receivedAt: z.date(),
    sourceRef: z.string().trim().min(1).max(200),
  })
  .refine((value) => [value.name, value.phone, value.email, value.message].some((field) => field), { message: "An enquiry with contents needs a name, a phone number, an email address or a message." });

export type AcceptedEnquiryContents = z.input<typeof contentsSchema>;

/** The date the details must be erased by: the approved enquiry period after the enquiry arrived. */
export function retainUntil(receivedAt: Date): Date {
  const date = new Date(receivedAt);
  date.setUTCMonth(date.getUTCMonth() + RETENTION_PERIODS.enquiryMonths);
  return date;
}

/** Validates and stores one enquiry's details, or throws: EnquiryContentsDisabledError while the switch is off. Returns whether a row was added. Staff connection. */
export async function acceptEnquiryContents(db: Database, input: AcceptedEnquiryContents, env: FlagEnv = process.env): Promise<boolean> {
  if (!isEnquiryFormContentsEnabled(env)) throw new EnquiryContentsDisabledError();
  const value = contentsSchema.parse(input);
  const stored: EnquiryContentsInput = {
    businessId: value.businessId,
    kind: value.kind,
    source: value.source ?? null,
    name: value.name ?? null,
    phone: value.phone ?? null,
    email: value.email ?? null,
    message: value.message ?? null,
    receivedAt: value.receivedAt,
    retainUntil: retainUntil(value.receivedAt),
    sourceRef: value.sourceRef,
  };
  return recordEnquiryContents(db, stored);
}
