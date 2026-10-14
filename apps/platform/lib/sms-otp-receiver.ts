/** Browser OTP reception is an enhancement; the server action and manual entry always remain available. */
export interface SmsOtpReceiver {
  receive<T>(send: () => Promise<T>, challengeId: (result: T) => string | null): Promise<T>;
  cancel(): void;
}

export interface SmsOtpRuntime {
  read(signal: AbortSignal): Promise<unknown>;
}

export interface SmsOtpController extends SmsOtpReceiver {
  setHandler(handler: (otpId: string, code: string) => void): void;
}

interface SmsCredentialOptions extends CredentialRequestOptions {
  readonly otp: { readonly transport: ["sms"] };
}

interface Reception {
  readonly controller: AbortController;
  readonly cancel: () => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  challengeId: string | null;
  code: string | null;
}

const RECEPTION_TIMEOUT_MS = 60_000;
const SIX_DIGITS = /^[0-9]{6}$/;
// All review/comment forms in a page share this module. A newly requested code replaces the previous receiver.
let activeReception: Reception | null = null;

function browserRuntime(): SmsOtpRuntime | null {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    window.top !== window ||
    !("OTPCredential" in window) ||
    typeof navigator.credentials?.get !== "function"
  ) return null;

  return {
    read(signal: AbortSignal): Promise<unknown> {
      const options: SmsCredentialOptions = { otp: { transport: ["sms"] }, signal };
      return navigator.credentials.get(options);
    },
  };
}

function credentialCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("code" in value)) return null;
  return typeof value.code === "string" && SIX_DIGITS.test(value.code) ? value.code : null;
}

/** A send owns its receiver even when the SMS arrives before the server returns the challenge ID. */
export function createSmsOtpReceiver(
  onCode: (otpId: string, code: string) => void,
  runtime?: SmsOtpRuntime | null,
): SmsOtpController {
  let reception: Reception | null = null;
  let handler = onCode;

  function cancel(): void {
    const previous = reception;
    reception = null;
    if (previous === null) return;
    if (activeReception === previous) activeReception = null;
    previous.controller.abort();
    clearTimeout(previous.timeout);
    previous.code = null;
    previous.challengeId = null;
  }

  function deliver(attempt: Reception): void {
    if (reception !== attempt || attempt.controller.signal.aborted || attempt.challengeId === null || attempt.code === null) return;
    const { challengeId, code } = attempt;
    cancel();
    handler(challengeId, code);
  }

  function start(): Reception | null {
    cancel();
    const reader = runtime === undefined ? browserRuntime() : runtime;
    if (reader === null) return null;
    activeReception?.cancel();

    const controller = new AbortController();
    const attempt: Reception = {
      controller,
      cancel,
      timeout: setTimeout(cancel, RECEPTION_TIMEOUT_MS),
      challengeId: null,
      code: null,
    };
    reception = attempt;
    activeReception = attempt;
    try {
      void reader.read(controller.signal).then((credential: unknown) => {
        if (reception !== attempt || controller.signal.aborted) return;
        attempt.code = credentialCode(credential);
        if (attempt.code === null) cancel();
        else deliver(attempt);
      }).catch(() => {
        // Denied, cancelled or unavailable reception must never block typing or the server action.
        if (reception === attempt) cancel();
      });
    } catch {
      cancel();
    }
    return attempt;
  }

  return {
    cancel,
    setHandler(nextHandler: (otpId: string, code: string) => void): void {
      handler = nextHandler;
    },
    async receive<T>(send: () => Promise<T>, challengeId: (result: T) => string | null): Promise<T> {
      const attempt = start();
      try {
        const result = await send();
        if (attempt !== null && reception === attempt) {
          const id = challengeId(result);
          if (id === null || id.length === 0) cancel();
          else {
            attempt.challengeId = id;
            deliver(attempt);
          }
        }
        return result;
      } catch (error: unknown) {
        if (attempt !== null && reception === attempt) cancel();
        throw error;
      }
    },
  };
}
