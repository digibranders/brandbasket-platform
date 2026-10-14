import "server-only";
import { OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";

/** The name the registered DLT template carries. Only this text is registered, so only this text can be sent for real. */
const REGISTERED_BRAND = "Fynix";

function otpText(brandName: string): string {
  return ` is your ${brandName} code. It expires in ${OTP_TTL_SECONDS / 60} minutes. Do not share it.`;
}

const OTP_TEXT = otpText(REGISTERED_BRAND);
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const OTP_PATTERN = new RegExp(
  `^([0-9]{6})${OTP_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\n\\n@([a-z0-9.-]+) #([0-9]{6}) Fynix)?$`,
  "u",
);

export class OtpMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpMessageError";
  }
}

/** Only canonical ASCII DNS names: no schemes, ports, paths, IP addresses or line breaks. */
export function isOtpBindingHost(host: string): boolean {
  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2 || !labels.every((label) => DNS_LABEL.test(label))) return false;
  if (!/[a-z]/.test(labels.at(-1) ?? "")) return false;
  try {
    return new URL(`https://${host}`).hostname === host;
  } catch {
    return false;
  }
}

export function assertOtpBindingHost(host: string): void {
  if (!isOtpBindingHost(host)) throw new OtpMessageError("OTP binding must be a canonical DNS host.");
}

/**
 * The legacy registered text, or its separately approved fixed-host variant. Never append another line.
 *
 * `brandName` is for a dashboard sold under another name (Fynix Digital): it words the same text with that name. Such a
 * text is NOT registered with the operator, and parseOtpMessage (so the MSG91 sender) refuses it, so it cannot reach a
 * phone until that brand has its own DLT-registered template and sender id, with its own parse shape here.
 * TODO(fynix-sms): register Fynix's template and sender with the operator, then teach parseOtpMessage that shape.
 * Local development sends no SMS at all (SIGNUP_OTP_BYPASS, the outbox sender), so nothing depends on it yet.
 */
export function otpMessage(code: string, host?: string, brandName: string = REGISTERED_BRAND): string {
  if (!/^[0-9]{6}$/.test(code) || code.length !== 6) {
    throw new OtpMessageError("OTP code must contain exactly six ASCII digits.");
  }
  if (host !== undefined) assertOtpBindingHost(host);
  return `${code}${otpText(brandName)}${host === undefined ? "" : `\n\n@${host} #${code} ${brandName}`}`;
}

export interface ParsedOtpMessage {
  readonly code: string;
  readonly host: string | null;
}

/** Match the whole registered text and both code occurrences, including exact whitespace and suffix. */
export function parseOtpMessage(body: string): ParsedOtpMessage | null {
  const match = OTP_PATTERN.exec(body);
  if (match === null || match[0] !== body) return null;
  const code = match[1];
  if (code === undefined) return null;
  const host = match[2];
  if (host !== undefined && (!isOtpBindingHost(host) || match[3] !== code)) return null;
  return { code, host: host ?? null };
}

/** MSG91 substitutes the code only after confirming an exact approved message shape. */
export function otpCodeOf(body: string): string | null {
  return parseOtpMessage(body)?.code ?? null;
}
