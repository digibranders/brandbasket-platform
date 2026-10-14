import "server-only";
import { isOtpBindingHost } from "./otp-message";

export type OtpSmsSurface = "app" | "website";

export interface DomainBoundOtpTemplate {
  readonly host: string;
  readonly templateId: string;
}

export type OtpSmsBindings = Readonly<Partial<Record<OtpSmsSurface, DomainBoundOtpTemplate>>>;

const SURFACE_ENV = {
  app: { origin: "SMS_OTP_APP_ORIGIN", templateId: "MSG91_OTP_APP_TEMPLATE_ID" },
  website: { origin: "SMS_OTP_WEBSITE_ORIGIN", templateId: "MSG91_OTP_WEBSITE_TEMPLATE_ID" },
} as const;

export class OtpSmsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpSmsConfigurationError";
  }
}

/** Each surface opts in separately. Values are trusted deployment configuration, never request headers. */
export function otpSmsBinding(surface: OtpSmsSurface): DomainBoundOtpTemplate | undefined {
  const names = SURFACE_ENV[surface];
  const origin = process.env[names.origin];
  const templateId = process.env[names.templateId]?.trim();
  if (!origin?.trim() && !templateId) return undefined;
  if (!origin?.trim() || !templateId) {
    throw new OtpSmsConfigurationError(`${names.origin} and ${names.templateId} must be set together.`);
  }
  const match = /^https:\/\/([a-z0-9.-]+)\/?$/.exec(origin);
  const host = match?.[1];
  if (match?.[0] !== origin || host === undefined || !isOtpBindingHost(host)) {
    throw new OtpSmsConfigurationError(`${names.origin} must be an exact canonical HTTPS DNS origin, without credentials, port, path, query or fragment.`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(templateId)) {
    throw new OtpSmsConfigurationError(`${names.templateId} must be a provider template identifier.`);
  }
  return { host, templateId };
}

export function otpSmsBindings(): OtpSmsBindings {
  return { app: otpSmsBinding("app"), website: otpSmsBinding("website") };
}
