import type { Database } from "@firstfold/db";
import type { EmailMessage } from "./message";
import { emailBrandId, emailSenderDefaults } from "./brand";
import { createOutboxTransport, OUTBOX_TRANSPORT_NAME, recordOutboxCopy, type EmailTransport } from "./outbox";

export interface BrevoSender {
  readonly email: string;
  readonly name?: string;
}

export interface BrevoConfig {
  readonly apiKey: string;
  readonly defaultSender?: BrevoSender;
  readonly replyTo?: BrevoSender;
  readonly fetchFn?: typeof fetch;
  /** How long one delivery request may take before it is abandoned. */
  readonly timeoutMs?: number;
}

export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
/** A slow Brevo must not hold a customer's request open, so every delivery is cut off after this long. */
export const BREVO_TIMEOUT_MS = 10_000;
/** Transport name stored on an outbox row that records a message Brevo could not deliver. */
export const BREVO_FALLBACK_TRANSPORT_NAME = OUTBOX_TRANSPORT_NAME;

export class BrevoDeliveryError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = "BrevoDeliveryError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/** Thrown where real customers can reach the app but no email provider is configured. */
export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

type EmailEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Delivers transactional emails via the Brevo REST API (v3).
 */
export function createBrevoTransport(config: BrevoConfig): EmailTransport {
  const fetcher = config.fetchFn ?? fetch;
  // Never a hard-coded brand: a transport built with no sender is the deployment's own brand's.
  const fallback = emailSenderDefaults(emailBrandId()).from;
  const senderEmail = config.defaultSender?.email ?? fallback.email;
  const senderName = config.defaultSender?.name ?? fallback.name;

  return {
    send: async (message: EmailMessage): Promise<void> => {
      const payload: Record<string, unknown> = {
        sender: {
          email: senderEmail,
          name: senderName,
        },
        to: [
          {
            email: message.to,
          },
        ],
        subject: message.subject,
        htmlContent: message.bodyHtml,
        textContent: message.bodyText,
      };

      if (config.replyTo !== undefined) {
        payload.replyTo = {
          email: config.replyTo.email,
          ...(config.replyTo.name ? { name: config.replyTo.name } : {}),
        };
      }

      const response = await fetcher(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs ?? BREVO_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new BrevoDeliveryError(
          `Brevo email delivery failed with status ${response.status}: ${errorText}`,
          response.status,
          errorText,
        );
      }
    },
  };
}

/**
 * Delivers live through Brevo and records a copy in the database outbox for staff. If Brevo fails (rejected, unreachable
 * or timed out) the message is recorded in the outbox as undelivered instead, so staff still see it, and the failure is
 * logged rather than thrown: an email must never fail the request that triggered it. Only if the outbox write also
 * fails does the error reach the caller.
 */
export function createDualTransport(brevoTransport: EmailTransport, db: Database): EmailTransport {
  return {
    send: async (message: EmailMessage): Promise<void> => {
      try {
        await brevoTransport.send(message);
      } catch (error) {
        console.error("[email] Brevo delivery failed; recording the message in the outbox instead", error);
        await recordOutboxCopy(db, message, BREVO_FALLBACK_TRANSPORT_NAME);
        return;
      }

      try {
        await recordOutboxCopy(db, message, "brevo");
      } catch (error) {
        console.warn("[email] Brevo email sent but recording to outbox table failed", error);
      }
    },
  };
}

/**
 * Who mail comes from, and where replies go, when the environment names no one: the deployment's own brand. A server that
 * serves Fynix only (PLATFORM_BRAND=fynix) must never send from firstfold.io, so it falls back to Fynix's addresses
 * (the domain has to be authenticated in Brevo first, as for any sender). A Fynix server sends as "Fynix Digital" from
 * FYNIX_MAIL_FROM (no-reply@fynix.digital when it is unset). ALERTS_FROM_EMAIL, ALERTS_FROM_NAME and SUPPORT_ALERT_EMAIL,
 * when set, win over the defaults; FYNIX_MAIL_FROM wins over ALERTS_FROM_EMAIL on a Fynix server and is ignored elsewhere.
 */


function brevoFromEnv(env: EmailEnvironment, replyTo?: BrevoSender, fetchFn?: typeof fetch): EmailTransport | null {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) return null;
  const brand = emailBrandId(env);
  const fynix = brand === "fynix";
  const defaults = emailSenderDefaults(brand);
  return createBrevoTransport({
    apiKey,
    defaultSender: {
      email: (fynix ? env.FYNIX_MAIL_FROM?.trim() : undefined) || env.ALERTS_FROM_EMAIL?.trim() || defaults.from.email,
      name: env.ALERTS_FROM_NAME?.trim() || defaults.from.name,
    },
    replyTo: replyTo ?? { email: env.SUPPORT_ALERT_EMAIL?.trim() || defaults.replyTo.email, name: defaults.replyTo.name },
    ...(fetchFn ? { fetchFn } : {}),
  });
}

/**
 * Sends through Brevo and records nothing, for a caller that has already written its own outbox row (a password reset
 * writes the same row for every address, so the reply time says nothing about which addresses have accounts). Null
 * when no Brevo key is configured.
 */
export function createEmailDelivery(
  env: EmailEnvironment = process.env,
  options?: { readonly fetchFn?: typeof fetch },
): EmailTransport | null {
  return brevoFromEnv(env, undefined, options?.fetchFn);
}

/**
 * The transport for app email:
 * - With BREVO_API_KEY: delivers through Brevo and records the outbox copy (createDualTransport).
 * - Without it, on a real deployment (`realDeployment`): throws, because a reset or setup link that is only stored can
 *   never reach the person and can be read by anyone with outbox access.
 * - Without it, locally: the outbox is the inbox, and sign-in links stay readable there.
 */
export function createAppEmailTransport(
  db: Database,
  options?: {
    readonly env?: EmailEnvironment;
    readonly replyTo?: BrevoSender;
    readonly realDeployment?: boolean;
  },
): EmailTransport {
  const brevo = brevoFromEnv(options?.env ?? process.env, options?.replyTo);
  if (brevo !== null) return createDualTransport(brevo, db);
  if (options?.realDeployment === true) {
    throw new EmailConfigurationError(
      "BREVO_API_KEY must be set where real customers can reach the app: without it, reset and setup links are never delivered.",
    );
  }
  return createOutboxTransport(db, { keepLinksForLocalDevelopment: true });
}
