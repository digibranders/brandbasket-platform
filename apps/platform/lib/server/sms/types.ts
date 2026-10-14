import "server-only";

export interface SmsMessage {
  /** E.164, e.g. "+919876543210". */
  readonly to: string;
  readonly body: string;
  /** The platform business the message is for, or null when it is for no business (a directory review code). */
  readonly businessId: string | null;
}

/** What every SMS provider (the local outbox, and later a real one such as MSG91 or Twilio) implements. See
 * ./index.ts for how a new provider is wired in. */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}
