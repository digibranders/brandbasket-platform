import type { Database } from "@brandbasket/db";
import type { EmailMessage } from "./message";
import { emailSenderDefaults } from "./brand";
import { createOutboxTransport, recordOutboxCopy, type EmailTransport } from "./outbox";

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
  /** Pause before the second attempt after a retryable failure. */
  readonly retryDelayMs?: number;
}

export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
/** A slow Brevo must not hold a customer's request open, so every delivery is cut off after this long. */
export const BREVO_TIMEOUT_MS = 10_000;
/** One try plus one retry: a timed out request is usually a blip, and a customer is waiting on the code. */
export const BREVO_MAX_ATTEMPTS = 2;
export const BREVO_RETRY_DELAY_MS = 500;

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

/** What Brevo said when it took a message: its id, to find the message in Brevo's own logs. */
export interface BrevoReceipt {
  readonly providerMessageId: string | null;
}

/** A transport that sends through Brevo and answers with Brevo's receipt. */
export interface BrevoTransport {
  readonly send: (message: EmailMessage) => Promise<BrevoReceipt>;
}

const MAX_FAILURE_LENGTH = 300;

/** Brevo's id from its reply (`{ "messageId": "<...>" }`), or null when the reply has none. */
function messageIdOf(answer: unknown): string | null {
  if (typeof answer !== "object" || answer === null) return null;
  const id = (answer as Record<string, unknown>).messageId;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * Why a message did not go, for the outbox row and the console. Brevo's own answer is kept (it says which address or
 * field it refused); a thrown error's message is not, as it can carry the request.
 */
export function emailFailureSummary(error: unknown): string {
  if (error instanceof BrevoDeliveryError) {
    const body = error.responseBody.trim().replace(/\s+/g, " ");
    return `Brevo answered ${error.statusCode}${body === "" ? "" : `: ${body}`}`.slice(0, MAX_FAILURE_LENGTH);
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "Brevo did not answer in time";
  return "Brevo could not be reached";
}

/** A timeout, a network error, a 5xx or a 429 may pass on a second try; any other 4xx (bad key, sender, blocked) will not. */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof BrevoDeliveryError)) return true;
  return error.statusCode >= 500 || error.statusCode === 429;
}

type EmailEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Delivers transactional emails via the Brevo REST API (v3).
 */
export function createBrevoTransport(config: BrevoConfig): BrevoTransport {
  const fetcher = config.fetchFn ?? fetch;
  const fallback = emailSenderDefaults().from;
  const senderEmail = config.defaultSender?.email ?? fallback.email;
  const senderName = config.defaultSender?.name ?? fallback.name;

  return {
    send: async (message: EmailMessage): Promise<BrevoReceipt> => {
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

      // Brevo's /smtp/email takes no idempotency key, so a retry after a response that timed out could send the message twice.
      // For a verification code that is harmless; the first attempt's failure is logged either way.
      for (let attempt = 1; ; attempt += 1) {
        try {
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
          return { providerMessageId: messageIdOf(await response.json().catch(() => null)) };
        } catch (error) {
          const willRetry = attempt < BREVO_MAX_ATTEMPTS && isRetryable(error);
          console.error(
            `[email] Brevo attempt ${attempt} of ${BREVO_MAX_ATTEMPTS} failed${willRetry ? "; retrying" : ""}`,
            error,
          );
          if (!willRetry) throw error;
          await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs ?? BREVO_RETRY_DELAY_MS));
        }
      }
    },
  };
}

/**
 * Delivers live through Brevo and records a copy in the database outbox for staff, with what became of it. If Brevo
 * fails (rejected, unreachable or timed out) the copy is recorded as failed with the reason, so staff see it and can send
 * it again, and the failure is logged rather than thrown: an email must never fail the request that triggered it. Only
 * if the outbox write also fails does the error reach the caller.
 */
export function createDualTransport(
  brevoTransport: { readonly send: (message: EmailMessage) => Promise<BrevoReceipt | void> },
  db: Database,
): EmailTransport {
  return {
    send: async (message: EmailMessage): Promise<void> => {
      let receipt: BrevoReceipt | void;
      try {
        receipt = await brevoTransport.send(message);
      } catch (error) {
        console.error("[email] Brevo delivery failed; recording the message as failed", error);
        await recordOutboxCopy(db, message, "brevo", {}, { status: "failed", error: emailFailureSummary(error) });
        return;
      }

      try {
        const providerMessageId = typeof receipt === "object" && receipt !== null ? receipt.providerMessageId : null;
        await recordOutboxCopy(db, message, "brevo", {}, { status: "sent", providerMessageId });
      } catch (error) {
        console.warn("[email] Brevo email sent but recording to outbox table failed", error);
      }
    },
  };
}

/**
 * Who mail comes from, and where replies go, when the environment names no one: Brandbasket's own addresses (the domain has to be
 * authenticated in Brevo first, as for any sender). It sends as "Brandbasket" from BRANDBASKET_MAIL_FROM (no-reply@brandbasket.in
 * when it is unset). ALERTS_FROM_EMAIL, ALERTS_FROM_NAME and SUPPORT_ALERT_EMAIL, when set, win over the defaults;
 * BRANDBASKET_MAIL_FROM wins over ALERTS_FROM_EMAIL.
 */
function brevoFromEnv(env: EmailEnvironment, replyTo?: BrevoSender, fetchFn?: typeof fetch): BrevoTransport | null {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) return null;
  const defaults = emailSenderDefaults();
  return createBrevoTransport({
    apiKey,
    defaultSender: {
      email: env.BRANDBASKET_MAIL_FROM?.trim() || env.ALERTS_FROM_EMAIL?.trim() || defaults.from.email,
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
): BrevoTransport | null {
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
