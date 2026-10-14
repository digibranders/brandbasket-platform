"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement } from "react";
import { OTP_LENGTH } from "@firstfold/shared/lib/appointments/otp";
import { FIELD_PATTERNS } from "@firstfold/shared/lib/forms/input-rules";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { StatusLine } from "@/components/panel/status-line";
import { initialVerifyBusinessState, type VerifyBusinessState } from "@/lib/verify-business-form";
import { useSmsOtpAutofill } from "@/lib/use-sms-otp-autofill";

const INPUT_CLASSES =
  "mt-2 block w-40 rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-center text-xl tracking-[0.4em] tabular-nums text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";
const ERROR_ID = "verify-business-error";

interface VerifyBusinessProps {
  readonly action: (state: VerifyBusinessState, formData: FormData) => Promise<VerifyBusinessState>;
  /** The business's number, hidden but for its last four digits. */
  readonly phoneHint: string;
}

/**
 * "Verify my business": one button asks for a code to the business's number, then the code is typed and confirmed.
 * With the temporary bypass on nothing is texted, and the form says so and takes any six digits.
 */
export function VerifyBusiness({ action, phoneHint }: VerifyBusinessProps): ReactElement {
  const [codeEntry, setCodeEntry] = useState<{ readonly otpId: string; readonly value: string }>({ otpId: "", value: "" });
  const smsOtp = useSmsOtpAutofill((otpId, value) => {
    setCodeEntry((current) => current.otpId === otpId && current.value !== "" ? current : { otpId, value });
  });
  const [state, formAction, pending] = useActionState(async (previous: VerifyBusinessState, formData: FormData): Promise<VerifyBusinessState> => {
    if (!formData.get("otpId") || formData.get("intent") === "resend") {
      return smsOtp.receive(() => action(previous, formData), (result) =>
        result.status === "sent" && result.texted ? result.otpId : null);
    }
    smsOtp.cancel();
    return action(previous, formData);
  }, initialVerifyBusinessState);
  const codeRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<HTMLFormElement>(null);
  const live = state.status === "sent" ? state : state.status === "error" && state.step !== "send" ? state.step : null;
  const otpId = live?.otpId ?? null;
  const texted = live?.texted ?? true;
  const error = state.status === "error" && !pending ? state.message : null;
  const destination = live?.phoneHint ?? (state.status === "error" ? state.phoneHint : undefined) ?? phoneHint;
  const code = codeEntry.otpId === otpId ? codeEntry.value : "";

  useEffect(() => {
    if (pending) return;
    if (otpId !== null) codeRef.current?.focus();
    else if (state.status === "error") sendRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }, [otpId, state, pending]);

  if (otpId === null) {
    return (
      <form ref={sendRef} action={formAction} aria-busy={pending} className="space-y-3">
        {error === null ? null : (
          <p id={ERROR_ID} role="alert" className="text-sm text-accent-deep">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} aria-busy={pending} aria-describedby={error === null ? undefined : ERROR_ID}>
          Verify my business
        </Button>
        <p className="text-sm text-ink-soft">We&rsquo;ll send a code to {destination}.</p>
      </form>
    );
  }
  return (
    <form action={formAction} aria-busy={pending} className="space-y-3">
      <input type="hidden" name="otpId" value={otpId} />
      <input type="hidden" name="texted" value={texted ? "1" : "0"} />
      <p className="text-sm text-ink-soft">
        {texted ? `Enter the ${OTP_LENGTH}-digit code we sent to ${destination}.` : `No code is sent for now. Enter any ${OTP_LENGTH} digits.`}
      </p>
      <div>
        <label htmlFor="verify-code" className="block text-sm font-medium">
          Code
          <RequiredMark />
        </label>
        <RuleInput
          ref={codeRef}
          id="verify-code"
          name="code"
          rule="digits"
          required
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          pattern={FIELD_PATTERNS.otp}
          title={`${String(OTP_LENGTH)} digits`}
          placeholder={"0".repeat(OTP_LENGTH)}
          value={code}
          readOnly={pending}
          onChange={(event) => {
            smsOtp.cancel();
            setCodeEntry({ otpId, value: event.target.value });
          }}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : ERROR_ID}
          className={INPUT_CLASSES}
        />
      </div>
      {error === null ? null : (
        <p id={ERROR_ID} role="alert" className="text-sm text-accent-deep">
          {error}
        </p>
      )}
      <SubmitButton name="intent" value="confirm" disabled={pending}>
        Confirm
      </SubmitButton>
      <SubmitButton name="intent" value="resend" variant="quiet" disabled={pending} formNoValidate>
        Send a new code
      </SubmitButton>
    </form>
  );
}

/** Verification done: the line the Review tab shows once the business is verified. */
export function VerifiedLine({ since }: { readonly since: string }): ReactElement {
  return <StatusLine tone="done">Verified{since === "" ? null : <span className="font-normal text-ink-soft">{` · since ${since}`}</span>}</StatusLine>;
}
