import "server-only";
import { assertOtpBindingHost, parseOtpMessage } from "./otp-message";
import { OtpSmsConfigurationError, type OtpSmsBindings } from "./domain-binding";
import type { SmsMessage, SmsSender } from "./types";

const FLOW_URL = "https://control.msg91.com/api/v5/flow";
const REQUEST_TIMEOUT_MS = 10_000;

export interface Msg91Config {
  readonly authKey: string;
  /** The existing DLT-registered template remains the default, including client booking OTPs. */
  readonly templateId: string;
  readonly bindings?: OtpSmsBindings;
}

export class Msg91DeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Msg91DeliveryError";
  }
}

/** MSG91 wants the number as digits with the country code and no "+". */
function mobileDigits(e164: string): string {
  const match = /^\+[1-9][0-9]{1,14}$/.exec(e164);
  if (match?.[0] !== e164) throw new Msg91DeliveryError("MSG91 destination must be an E.164 phone number.");
  return e164.slice(1);
}

/**
 * Sends a code through MSG91's Flow API. The provider texts its own DLT-registered template, so what goes over the wire
 * is the approved template id and code substitutions. Domain-bound messages must match a configured fixed host;
 * both template variables receive the same validated code. Errors never include the number, code or auth key.
 */
export function createMsg91Sender(config: Msg91Config, fetchImpl: typeof fetch = fetch): SmsSender {
  const boundTemplates = new Map<string, string>();
  const templateIds = new Set([config.templateId]);
  for (const binding of Object.values(config.bindings ?? {})) {
    if (binding === undefined) continue;
    assertOtpBindingHost(binding.host);
    if (!/^[a-zA-Z0-9_-]+$/.test(binding.templateId)) {
      throw new OtpSmsConfigurationError("A domain-bound MSG91 template identifier is invalid.");
    }
    if (boundTemplates.has(binding.host)) {
      throw new OtpSmsConfigurationError("App and website MSG91 templates cannot bind the same host.");
    }
    if (templateIds.has(binding.templateId)) {
      throw new OtpSmsConfigurationError("Legacy, app and website MSG91 messages require distinct template IDs.");
    }
    boundTemplates.set(binding.host, binding.templateId);
    templateIds.add(binding.templateId);
  }
  return {
    async send(message: SmsMessage): Promise<void> {
      const parsed = parseOtpMessage(message.body);
      if (parsed === null) {
        throw new Msg91DeliveryError("MSG91 can only send the registered code text; this message does not match it.");
      }
      const templateId = parsed.host === null ? config.templateId : boundTemplates.get(parsed.host);
      if (templateId === undefined) throw new OtpSmsConfigurationError("No approved MSG91 template matches the OTP binding host.");
      const substitutions = parsed.host === null ? { code: parsed.code } : { code: parsed.code, binding_code: parsed.code };
      const response = await fetchImpl(FLOW_URL, {
        method: "POST",
        headers: { authkey: config.authKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          short_url: "0",
          recipients: [{ mobiles: mobileDigits(message.to), ...substitutions }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Msg91DeliveryError(`MSG91 refused the text (HTTP ${response.status}).`);
      const reply: unknown = await response.json().catch(() => null);
      if (typeof reply !== "object" || reply === null || !("type" in reply) || reply.type !== "success") {
        throw new Msg91DeliveryError("MSG91 did not accept the text.");
      }
    },
  };
}
