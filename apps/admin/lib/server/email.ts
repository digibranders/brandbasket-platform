import "server-only";
import { isRealDeployment } from "@firstfold/billing";
import type { Database } from "@firstfold/db";
import { createAppEmailTransport, type EmailTransport } from "@firstfold/email";

/** Whether real customers can reach this deployment: Vercel production, or an https APP_ORIGIN on a public host. */
export function realDeployment(): boolean {
  return isRealDeployment({ VERCEL_ENV: process.env.VERCEL_ENV, APP_ORIGIN: process.env.APP_ORIGIN });
}

/** Emails to customers: delivered by Brevo with a redacted outbox copy, or held in the local development inbox. */
export function customerEmailTransport(db: Database): EmailTransport {
  return createAppEmailTransport(db, { realDeployment: realDeployment() });
}
