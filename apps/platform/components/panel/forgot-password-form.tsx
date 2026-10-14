"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactElement } from "react";
import { clientBrandName } from "@firstfold/shared/lib/deployment-brand";
import { OTP_LENGTH } from "@firstfold/shared/lib/appointments/otp";
import { EyeIcon, EyeOffIcon } from "@firstfold/shared/ui/icons";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { TurnstileWidget } from "@firstfold/shared/ui/turnstile";
import { FORGOT_PASSWORD_PATH, initialForgotPasswordState, type ForgotPasswordFormState } from "@/lib/account-recovery-form";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";
import { useOtpRetryCooldown } from "@/lib/use-otp-retry-cooldown";
import { useSmsOtpAutofill } from "@/lib/use-sms-otp-autofill";

interface ForgotPasswordFormProps {
  readonly action: (state: ForgotPasswordFormState, formData: FormData) => Promise<ForgotPasswordFormState>;
  /** What the "If … has a … account" lines call the product. */
  readonly brandName?: string;
  /** True for a brand whose accounts all sign in with an email (Fynix): the form asks for an address and only ever sends a link. */
  readonly emailOnly?: boolean;
}

const ERROR_ID = "forgot-password-error";
/** The longest password the server accepts (lib/account-recovery-form.ts). */
const PASSWORD_MAX_LENGTH = 128;
/** A finished code: exactly the digits the server expects. */
const CODE_PATTERN = `[0-9]{${OTP_LENGTH}}`;
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";
const REVEAL_CLASSES =
  "absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink";

/**
 * Asks what the account signs in with. A mobile number is texted a code, and the form then asks for the code and the
 * new password together. An email is sent a link to choose one. What it says afterwards is the same whether or not
 * the number or address has an account. Every value is held here, so the code step sends the number again and a
 * refused submission leaves the form as it was.
 */
export function ForgotPasswordForm({ action, brandName = clientBrandName(), emailOnly = false }: ForgotPasswordFormProps): ReactElement {
  const cooldown = useOtpRetryCooldown();
  const runAction = async (previous: ForgotPasswordFormState, formData: FormData): Promise<ForgotPasswordFormState> => {
    const result = await action(previous, formData);
    if (result.status === "error" && result.retry !== undefined) cooldown.begin(result.retry);
    return result;
  };
  /** A code belongs to the exact challenge that requested it, including before its send response renders. */
  const [codeEntry, setCodeEntry] = useState<{ readonly otpId: string; readonly value: string }>({ otpId: "", value: "" });
  const smsOtp = useSmsOtpAutofill((otpId, value) => {
    setCodeEntry((current) => current.otpId === otpId && current.value !== "" ? current : { otpId, value });
  });
  const [state, formAction, isPending] = useActionState(async (previous: ForgotPasswordFormState, formData: FormData): Promise<ForgotPasswordFormState> => {
    const sending = !formData.get("otpId") || formData.get("resend") === "1";
    const identifier = formData.get("identifier");
    const mobile = typeof identifier === "string" && !identifier.includes("@");
    if (sending && mobile) {
      return smsOtp.receive(() => runAction(previous, formData), (result) =>
        result.status === "code" ? result.otp.otpId : null);
    }
    smsOtp.cancel();
    return runAction(previous, formData);
  }, initialForgotPasswordState);
  const [identifier, setIdentifier] = useState("");
  /** The result the person has moved on from with "Change number": its error is not shown on the step they went back to. */
  const [leftState, setLeftState] = useState<ForgotPasswordFormState | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  /** The texted code the person walked away from with "Change number": back to the first question until a new one is sent. */
  const [leftOtpId, setLeftOtpId] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);

  const otp = state.status === "code" || state.status === "error" ? state.otp : null;
  const onCodeStep = otp !== null && otp.otpId !== leftOtpId;
  const code = otp !== null && codeEntry.otpId === otp.otpId ? codeEntry.value : "";
  const errorMessage = state.status === "error" && !isPending && state !== leftState ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  useEffect(() => {
    if (isPending) return;
    if (errorMessage !== null) errorRef.current?.focus();
    else if (state.status === "sent") resultRef.current?.focus();
    else if (onCodeStep) codeRef.current?.focus();
    else if (leftOtpId !== null) identifierRef.current?.focus();
  }, [state, isPending, errorMessage, onCodeStep, leftOtpId]);

  const error =
    errorMessage === null ? null : (
      <p ref={errorRef} tabIndex={-1} id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
        {errorMessage}
      </p>
    );

  if (state.status === "sent") {
    return (
      <div className="space-y-5">
        <p ref={resultRef} tabIndex={-1} role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          If {state.email} has a {brandName} account, we&rsquo;ve emailed it a link to choose a new password. The link works for
          one hour.
        </p>
        <p className="text-sm text-ink-soft">
          Nothing in your inbox after a few minutes? Check spam, or{" "}
          {/* A full page load, so the form comes back empty rather than showing this message again. */}
          <a href={FORGOT_PASSWORD_PATH} className="link-underline">
            ask for the link again
          </a>
          .
        </p>
        <Link href="/login" className="link-underline text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (onCodeStep) {
    return (
      <form action={formAction} noValidate className="space-y-5">
        <input type="hidden" name="identifier" value={identifier} />
        <input type="hidden" name="otpId" value={otp.otpId} />

        <p role="status" className="text-sm text-ink-soft">
          If <span className="font-medium tabular-nums text-ink">{otp.phoneHint}</span> has a {brandName} account, we&rsquo;ve texted it a{" "}
          {OTP_LENGTH}-digit code. It works for 10 minutes.
        </p>
        <div>
          <label htmlFor="forgot-code" className="block text-sm font-medium">
            Code
            <RequiredMark />
          </label>
          <RuleInput
            ref={codeRef}
            id="forgot-code"
            name="code"
            rule="digits"
            required
            pattern={CODE_PATTERN}
            title={`${OTP_LENGTH} digits`}
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH + 2}
            placeholder={"0".repeat(OTP_LENGTH)}
            value={code}
            readOnly={isPending}
            onChange={(event) => {
              smsOtp.cancel();
              setCodeEntry({ otpId: otp.otpId, value: event.target.value });
            }}
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={`${INPUT_CLASSES} text-center text-xl tracking-[0.4em] tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="forgot-new-password" className="block text-sm font-medium">
            New password
            <RequiredMark />
          </label>
          <div className="relative">
            <input
              id="forgot-new-password"
              name="password"
              type={revealed ? "text" : "password"}
              required
              autoComplete="new-password"
              minLength={SETUP_PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={`forgot-password-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
              className={`${INPUT_CLASSES} pr-12`}
            />
            <button
              type="button"
              onClick={() => setRevealed((shown) => !shown)}
              aria-label={revealed ? "Hide passwords" : "Show passwords"}
              aria-pressed={revealed}
              className={REVEAL_CLASSES}
            >
              {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
            </button>
          </div>
          <p id="forgot-password-hint" className="mt-2 text-sm text-ink-soft">
            At least {SETUP_PASSWORD_MIN_LENGTH} characters.
          </p>
        </div>
        <div>
          <label htmlFor="forgot-confirm-password" className="block text-sm font-medium">
            New password again
            <RequiredMark />
          </label>
          <input
            id="forgot-confirm-password"
            name="confirmPassword"
            type={revealed ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={SETUP_PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-describedby={describedBy}
            className={INPUT_CLASSES}
          />
        </div>

        {error}

        <TurnstileWidget action="forgot_password" resetKey={state} />

        <SubmitButton disabled={isPending || cooldown.confirmSeconds > 0} className="w-full">
          {isPending ? "Saving…" : "Set new password"}
        </SubmitButton>
        <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-soft">
          <button type="submit" name="resend" value="1" formNoValidate disabled={isPending || cooldown.sendSeconds > 0} className="link-underline">
            {cooldown.sendSeconds > 0 ? `Send a new code in ${cooldown.sendSeconds}s` : "Send a new code"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (isPending) return;
              smsOtp.cancel();
              setLeftOtpId(otp.otpId);
              setLeftState(state);
            }}
            className="link-underline"
          >
            Change number
          </button>
        </p>
      </form>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <div>
        <label htmlFor="forgot-identifier" className="block text-sm font-medium">
          {emailOnly ? "Email" : "Mobile number or email"}
          <RequiredMark />
        </label>
        <input
          ref={identifierRef}
          id="forgot-identifier"
          name="identifier"
          type={emailOnly ? "email" : "text"}
          required
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={254}
          placeholder={emailOnly ? "you@yourbusiness.com" : "98200 00000"}
          value={identifier}
          readOnly={isPending}
          onChange={(event) => {
            smsOtp.cancel();
            cooldown.clearPhoneLimits();
            setIdentifier(event.target.value);
          }}
          aria-invalid={errorMessage === null ? undefined : true}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        />
      </div>

      {error}

      <TurnstileWidget action="forgot_password" resetKey={state} />

      <SubmitButton disabled={isPending || (!identifier.includes("@") && cooldown.sendSeconds > 0)} className="w-full">
        {isPending ? "Sending…" : emailOnly ? "Email me a link" : "Continue"}
      </SubmitButton>
      <p className="text-center text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="link-underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
