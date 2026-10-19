"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { HOME_COUNTRY, type CountryOption } from "@brandbasket/shared/lib/countries";
import { INDIA_STATES } from "@brandbasket/shared/lib/directory/india-states";
import { OTP_LENGTH } from "@brandbasket/shared/lib/appointments/otp";
import { cn } from "@brandbasket/shared/lib/cn";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { currencyForCountry } from "@brandbasket/shared/lib/pricing";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { TurnstileWidget } from "@brandbasket/shared/ui/turnstile";
import { ArrowIcon, EyeIcon, EyeOffIcon, HeartIcon, PinIcon } from "@brandbasket/shared/ui/icons";
import { ENTRY_LEDE_SLOT_ID, ENTRY_PATH, entryHrefForPlan } from "@/lib/account-entry";
import {
  AGREE_FIELD,
  AGREE_VALUE,
  initialJoinFormState,
  isPaidChoice,
  JOIN_BUSINESS_NAME_MAX_LENGTH,
  JOIN_NAME_MAX_LENGTH,
  type JoinChoice,
  type JoinFormState,
} from "@/lib/join-form";
import type { LegalLinks } from "@/lib/legal-links";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { useOtpRetryCooldown } from "@/lib/use-otp-retry-cooldown";

/** The paid plan's price line. */
export interface PlanPrices {
  readonly managed: string | null;
}

/** The paid plans' price lines in each currency: the form shows the one for the country the owner picks. */
export type PlanPricesByCurrency = Readonly<Record<MoneyCurrency, PlanPrices>>;

/** What each plan is, in a line, for the choice's cards. The page's own copy: the full lists are on each plan's page. */
const PLAN_OPTIONS: readonly {
  readonly choice: JoinChoice;
  readonly name: string;
  readonly line: string;
  /** The same line for a brand that does not sell the free listing (Brandbasket), so the cards never mention one. */
  readonly lineWithoutFree: string;
  /** The plan's mark, the same one its dashboard carries: a pin for the free listing, a heart for Managed Website. */
  readonly icon: (selected: boolean) => ReactElement;
}[] = [
  {
    choice: "listing_only",
    name: "Free listing",
    line: "Your business on the local directory.",
    lineWithoutFree: "",
    icon: (selected) => <PinIcon className={cn("size-6 shrink-0 transition-colors duration-300 ease-calm", selected ? "text-accent" : "text-ink-soft")} />,
  },
  {
    choice: "managed",
    name: "Managed Website",
    line: "Free listing + website",
    lineWithoutFree: "Your website built free, then looked after every month",
    icon: (selected) => <HeartIcon className={cn("size-6 shrink-0 transition-colors duration-300 ease-calm", selected ? "text-accent" : "text-ink-soft")} />,
  },
];

interface JoinFormProps {
  readonly action: (state: JoinFormState, formData: FormData) => Promise<JoinFormState>;
  /** A plan the link already chose (the website's plan buttons): the form opens on the details with it set. */
  readonly initialChoice: JoinChoice | null;
  /** The add-ons the website's basket chose, sent with the form so the plan's page opens with them ticked. */
  readonly addOns: readonly string[];
  /** The plan the plans open with already ticked, when the link chose none (Brandbasket: Care); null ticks none. */
  readonly preselected: JoinChoice | null;
  /** The plans this brand sells, in the order shown: the free listing is among them only on Brandbasket. */
  readonly choices: readonly JoinChoice[];
  /** Where the Terms and the Privacy Notice are, for the brand this is sold under (lib/legal-links.ts legalLinksFor). */
  readonly legalLinks: LegalLinks;
  /** Each paid plan's price as the page says it ("₹2,999 a month + 18% GST", "$75 a month"); null when no plan of that tier is on sale in that currency. */
  readonly prices: PlanPricesByCurrency;
  /**
   * False while the local bypass is on (EMAIL_CODE_BYPASS; lib/server/env.ts): the details step then promises no real
   * check. What the code step says comes from the server's own answer (JoinCodeStep.confirmRequired).
   */
  readonly confirmsCodes: boolean;
  /** Every country the owner may pick, by English name (lib/countries.ts countryOptions). */
  readonly countries: readonly CountryOption[];
}

function subscribeToNothing(): () => void {
  // The spot is drawn once with the page and never moves, so there is nothing to listen for.
  return () => undefined;
}

function ledeSlot(): HTMLElement | null {
  return document.getElementById(ENTRY_LEDE_SLOT_ID);
}

function noSlotOnServer(): null {
  return null;
}

/**
 * "Go back" from the details to the first question, placed at the end of the screen's lede line
 * (lib/account-entry.ts ENTRY_LEDE_SLOT_ID). The details typed so far are kept. Until the page has mounted there is no
 * spot to put it in, so it shows nothing for that moment.
 */
function GoBack({ onBack, disabled }: { readonly onBack: () => void; readonly disabled: boolean }): ReactElement | null {
  const slot = useSyncExternalStore(subscribeToNothing, ledeSlot, noSlotOnServer);
  if (slot === null) return null;
  return createPortal(
    <button
      type="button"
      onClick={onBack}
      disabled={disabled}
      className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
    >
      <ArrowIcon className="size-4 rotate-180 transition-transform duration-300 ease-calm group-hover:-translate-x-0.5" />
      Go back
    </button>,
    slot,
  );
}

/**
 * Each option is a label around its card. The label stays whole so the keyboard focus ring (which a clip would hide)
 * can sit outside the card; the card inside is `relative` so its hidden radio stays in its own box (left to the page,
 * focusing it can scroll the sign-in screen sideways, since that screen hides the overflow of its corner drawings).
 */
const OPTION_CLASSES =
  "relative block cursor-pointer rounded-control has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-highlight-deep";

/**
 * The card. The chosen one has its top-right corner cut away (`FOLD_SIZE` square) and the paper folded over it
 * (PaperFold). Both clips list the same points, so the cut grows out of the corner instead of jumping. The right padding
 * is a little wider than the fold, so the price stays clear of it.
 */
const FOLD_SIZE = "2.25rem";
const CARD_CLASSES =
  "relative flex items-center gap-3 rounded-control border border-ink-soft/65 bg-paper py-4 pl-3.5 pr-10 text-base sm:gap-4 sm:pl-4 sm:pr-11 transition-[background-color,border-color,clip-path] duration-500 ease-calm";
const CARD_WHOLE = "[clip-path:polygon(0_0,calc(100%-0rem)_0,100%_0rem,100%_100%,0_100%)]";
const CARD_CUT = `[clip-path:polygon(0_0,calc(100%-${FOLD_SIZE})_0,100%_${FOLD_SIZE},100%_100%,0_100%)]`;

/** What a card does when hovered and when chosen: burgundy for most, gold for Premium, the plan with the crown. */
const OPTION_TONES = {
  accent: {
    card: "hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-pale",
    // The back of the page, made from the card's own tint: no outline, the way paper has none. A shade darker right at the crease where it bends,
    // then lighter toward the tip where it lies flat and catches the light.
    flap: "linear-gradient(to bottom left, transparent 0 50%, color-mix(in oklab, var(--color-accent-pale) 78%, black) 50%, color-mix(in oklab, var(--color-accent-pale) 90%, black) 56%, color-mix(in oklab, var(--color-accent-pale) 55%, white) 74%, color-mix(in oklab, var(--color-accent-pale) 22%, white) 100%)",
  },
  gold: {
    card: "hover:border-gold-deep has-[:checked]:border-gold-deep has-[:checked]:bg-gold/25",
    flap: "linear-gradient(to bottom left, transparent 0 50%, #DCC38A 50%, #E8D4A6 56%, #F6E9C8 76%, #FFF8E6 100%)",
  },
} as const;

/**
 * The folded corner: a triangle of the page's back, with a soft shadow on the card beneath it. It grows out of the
 * corner when its card is chosen and shrinks back when another is. The gradient runs corner to corner, so its lines
 * lie parallel to the crease.
 */
function PaperFold({ chosen, flap }: { readonly chosen: boolean; readonly flap: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{ width: FOLD_SIZE, height: FOLD_SIZE, filter: "drop-shadow(-1px 1.5px 1px rgb(60 40 10 / 0.28)) drop-shadow(-3px 5px 5px rgb(60 40 10 / 0.14))" }}
      className={cn("pointer-events-none absolute -right-px -top-px origin-top-right transition-transform duration-500 ease-calm", chosen ? "scale-100" : "scale-0")}
    >
      <span className="absolute inset-0 [clip-path:polygon(0_0,100%_100%,0_100%)]" style={{ background: flap }} />
    </span>
  );
}

/** India's states and union territories by name, for the state select. */
const STATE_OPTIONS = [...INDIA_STATES].sort((a, b) => a.name.localeCompare(b.name, "en"));

const ERROR_ID = "join-error";
/** The longest password the server accepts (lib/join-form.ts). */
const PASSWORD_MAX_LENGTH = 128;
/** A finished code: exactly the digits the server expects. */
const CODE_PATTERN = `[0-9]{${OTP_LENGTH}}`;
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-3.5 py-2.5 text-sm text-ink sm:px-4 sm:py-3 sm:text-base transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";

/**
 * Creating an account, in three steps on one form: which plan the owner wants (all shown at once), then their name,
 * email address and a password, then the code we email to that address. Every value is held here, so the code step sends
 * the details again with the code and a refused submission leaves the form as it was. "Go back" returns to the plans,
 * "Change email" to the details, and "Send a new code" sends them again without a code.
 */
export function JoinForm({
  action,
  initialChoice,
  addOns,
  preselected,
  choices,
  legalLinks,
  prices,
  confirmsCodes,
  countries,
}: JoinFormProps): ReactElement {
  const cooldown = useOtpRetryCooldown();
  const runAction = async (previous: JoinFormState, formData: FormData): Promise<JoinFormState> => {
    const result = await action(previous, formData);
    if (result.status === "error" && result.retry !== undefined) cooldown.begin(result.retry);
    return result;
  };
  /** A code belongs to the exact challenge that requested it, including before its send response renders. */
  const [codeEntry, setCodeEntry] = useState<{ readonly otpId: string; readonly value: string }>({ otpId: "", value: "" });
  const [state, formAction, isPending] = useActionState(runAction, initialJoinFormState);
  /** The plan picked; a link that already chose one has picked it for the owner. */
  const [choice, setChoice] = useState<JoinChoice | null>(initialChoice ?? preselected);
  /** True once the owner has pressed Continue on the plans (or a link picked one for them). */
  const [choiceMade, setChoiceMade] = useState(initialChoice !== null);
  const [name, setName] = useState("");
  /** Asked only of a Managed Website sign-up. */
  const [newBusinessName, setNewBusinessName] = useState("");
  const [email, setEmail] = useState("");
  /** India first: the product is sold there. The state is never filled in for the owner; they pick it. */
  const [country, setCountry] = useState<string>(HOME_COUNTRY);
  const planPrices = prices[currencyForCountry(country)];
  const [stateCode, setStateCode] = useState("");
  const [password, setPassword] = useState("");
  /** Never ticked for the owner: agreeing to the Terms and Privacy Notice is their own act (DPDP Act s.6). */
  const [agreed, setAgreed] = useState(false);
  /** The result the person has moved on from with "Change email": its error is not shown on the step they went back to. */
  const [leftState, setLeftState] = useState<JoinFormState | null>(null);
  const [revealed, setRevealed] = useState(false);
  /** The emailed code the owner walked away from with "Change email": the form is back on the details until a new one is sent. */
  const [leftOtpId, setLeftOtpId] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const detailsRef = useRef<HTMLFormElement>(null);
  const planRef = useRef<HTMLLegendElement>(null);

  /** Continuing with a plan puts it in the address (`?new=1&plan=free`), and going back to the plans takes it out. */
  const settleChoice = (made: boolean): void => {
    if (isPending) return;
    setChoiceMade(made);
    window.history.replaceState(window.history.state, "", entryHrefForPlan(window.location.search, made ? choice : null));
  };

  const asksBusinessName = choice !== null && isPaidChoice(choice);

  const otp = state.status === "idle" ? null : state.otp;
  const onCodeStep = choice !== null && choiceMade && otp !== null && otp.otpId !== leftOtpId;
  const code = otp !== null && codeEntry.otpId === otp.otpId ? codeEntry.value : "";
  const errorMessage = state.status === "error" && !isPending && state !== leftState ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  useEffect(() => {
    if (isPending) return;
    if (!choiceMade) planRef.current?.focus();
    else if (errorMessage !== null) errorRef.current?.focus();
    else if (onCodeStep) codeRef.current?.focus();
    else if (choiceMade) detailsRef.current?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
    else planRef.current?.focus();
  }, [state, isPending, errorMessage, onCodeStep, choiceMade]);

  const sentFields = (
    <>
      {choice === null ? null : <input type="hidden" name="choice" value={choice} />}
      {addOns.length === 0 ? null : <input type="hidden" name="addons" value={addOns.join(",")} />}
    </>
  );
  const signInLine = (
    <p className="text-center text-xs text-ink-soft sm:text-sm">
      Already have an account?{" "}
      <Link href={ENTRY_PATH} className="link-underline">
        Sign in
      </Link>
    </p>
  );
  const error =
    errorMessage === null ? null : (
      <p ref={errorRef} tabIndex={-1} id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
        {errorMessage}
      </p>
    );

  if (choice === null || !choiceMade) {
    return (
      // Not a form: nothing is sent until the details are. Continue only moves on to them.
      <div className="space-y-6">
        <fieldset>
          <legend ref={planRef} tabIndex={-1} className="block text-xs font-medium sm:text-sm">
            Choose your plan
            <RequiredMark />
          </legend>
          <div className="mt-3 space-y-3">
            {PLAN_OPTIONS.filter((option) => choices.includes(option.choice)).map((option) => {
              const price = option.choice === "listing_only" ? "₹0" : planPrices[option.choice];
              const tone = OPTION_TONES.accent;
              return (
                <label key={option.choice} className={OPTION_CLASSES}>
                  <span className={cn(CARD_CLASSES, tone.card, choice === option.choice ? CARD_CUT : CARD_WHOLE)}>
                    <input
                      type="radio"
                      name="plan"
                      value={option.choice}
                      className="sr-only"
                      checked={choice === option.choice}
                      disabled={isPending}
                      onChange={() => setChoice(option.choice)}
                    />
                    {option.icon(choice === option.choice)}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-x-3">
                        <span className="font-medium">{option.name}</span>
                        {price === null ? null : <span className="whitespace-nowrap text-[0.8125rem] tabular-nums text-ink-soft sm:text-sm">{price}</span>}
                      </span>
                      <span className="block whitespace-nowrap text-[0.8125rem] text-ink-soft sm:text-sm">
                        {choices.includes("listing_only") ? option.line : option.lineWithoutFree}
                      </span>
                    </span>
                    <PaperFold chosen={choice === option.choice} flap={tone.flap} />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Button type="button" disabled={choice === null || isPending} onClick={() => settleChoice(true)} className="w-full py-3 sm:py-3.5">
          Continue
        </Button>
        {signInLine}
      </div>
    );
  }

  if (onCodeStep) {
    return (
      <form action={formAction} noValidate className="space-y-4 sm:space-y-5">
        {sentFields}
        {/* The details again: nothing about the owner is kept on the server until the code is confirmed. */}
        <input type="hidden" name="name" value={name} />
        {addOns.length === 0 ? null : <input type="hidden" name="addons" value={addOns.join(",")} />}
        {asksBusinessName ? <input type="hidden" name="businessName" value={newBusinessName} /> : null}
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="country" value={country} />
        {country === HOME_COUNTRY ? <input type="hidden" name="stateCode" value={stateCode} /> : null}
        <input type="hidden" name="password" value={password} />
        {agreed ? <input type="hidden" name={AGREE_FIELD} value={AGREE_VALUE} /> : null}
        <input type="hidden" name="otpId" value={otp.otpId} />

        <p role="status" className="text-sm text-ink-soft">
          {otp.confirmRequired ? (
            <>
              We emailed a {OTP_LENGTH}-digit code to <span className="font-medium text-ink">{otp.emailHint}</span>. It works for 10 minutes.
              Nothing there? Check your spam folder.
            </>
          ) : (
            // Local testing only (EMAIL_CODE_BYPASS): the code is in the outbox, but any six digits are accepted.
            <>
              Test mode: enter any {OTP_LENGTH} digits to continue with <span className="font-medium text-ink">{otp.emailHint}</span>.
            </>
          )}
        </p>
        <div>
          <label htmlFor="join-code" className="block text-xs font-medium sm:text-sm">
            Code
            <RequiredMark />
          </label>
          <RuleInput
            ref={codeRef}
            id="join-code"
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
            onChange={(event) => setCodeEntry({ otpId: otp.otpId, value: event.target.value })}
            aria-invalid={errorMessage === null ? undefined : true}
            aria-describedby={describedBy}
            className={`${INPUT_CLASSES} text-center text-xl tracking-[0.4em] tabular-nums`}
          />
        </div>

        {error}

        <TurnstileWidget action="join" resetKey={state} />

        <SubmitButton disabled={isPending || cooldown.confirmSeconds > 0} className="w-full py-3 sm:py-3.5">
          {isPending ? "Checking…" : otp.confirmRequired ? "Verify and continue" : "Continue"}
        </SubmitButton>
        <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-soft">
          {/* With the bypass on there is nothing to send again. */}
          {otp.confirmRequired ? (
            <button type="submit" name="resend" value="1" formNoValidate disabled={isPending || cooldown.sendSeconds > 0} className="link-underline">
              {cooldown.sendSeconds > 0 ? `Send a new code in ${cooldown.sendSeconds}s` : "Send a new code"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (isPending) return;
              setLeftOtpId(otp.otpId);
              setLeftState(state);
            }}
            className="link-underline"
          >
            Change email
          </button>
        </p>
      </form>
    );
  }

  return (
    <form ref={detailsRef} action={formAction} noValidate className="space-y-4 sm:space-y-5">
      {sentFields}
      <GoBack onBack={() => settleChoice(false)} disabled={isPending} />
      {choice !== "listing_only" ? (
        <p className="text-sm text-ink-soft">
          Signing up for the <span className="font-medium text-ink">{PLAN_OPTIONS.find((option) => option.choice === choice)?.name}</span> plan
          {" · "}
          <span className="tabular-nums">{planPrices[choice]}</span>
        </p>
      ) : null}
      {asksBusinessName ? (
        <div>
          <label htmlFor="join-business-name" className="block text-xs font-medium sm:text-sm">
            Business name
            <RequiredMark />
          </label>
          <input
            id="join-business-name"
            name="businessName"
            required
            autoComplete="organization"
            maxLength={JOIN_BUSINESS_NAME_MAX_LENGTH}
            value={newBusinessName}
            readOnly={isPending}
            onChange={(event) => setNewBusinessName(event.target.value)}
            aria-describedby={describedBy}
            className={INPUT_CLASSES}
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="join-name" className="block text-xs font-medium sm:text-sm">
          Your name
          <RequiredMark />
        </label>
        <RuleInput
          id="join-name"
          name="name"
          rule="personName"
          required
          autoComplete="name"
          maxLength={JOIN_NAME_MAX_LENGTH}
          value={name}
          readOnly={isPending}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        />
      </div>
      <div>
        <label htmlFor="join-email" className="block text-xs font-medium sm:text-sm">
          Email
          <RequiredMark />
        </label>
        <input
          id="join-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          placeholder="you@yourbusiness.com"
          value={email}
          readOnly={isPending}
          onChange={(event) => {
            cooldown.clearAddressLimits();
            setEmail(event.target.value);
          }}
          aria-describedby={`join-email-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
          className={INPUT_CLASSES}
        />
        <p id="join-email-hint" className="mt-2 text-xs text-ink-soft sm:text-sm">
          {confirmsCodes ? <>You sign in with it. We&rsquo;ll email it a code now.</> : "You sign in with it."}
        </p>
      </div>
      <div>
        <label htmlFor="join-country" className="block text-xs font-medium sm:text-sm">
          Country
          <RequiredMark />
        </label>
        <select
          id="join-country"
          name="country"
          required
          autoComplete="country"
          value={country}
          disabled={isPending}
          onChange={(event) => setCountry(event.target.value)}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        >
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      {country === HOME_COUNTRY ? (
        <div>
          <label htmlFor="join-state" className="block text-xs font-medium sm:text-sm">
            State
            <RequiredMark />
          </label>
          <select
            id="join-state"
            name="stateCode"
            required
            autoComplete="address-level1"
            value={stateCode}
            disabled={isPending}
            onChange={(event) => setStateCode(event.target.value)}
            aria-describedby={`join-state-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
            className={INPUT_CLASSES}
          >
            <option value="" disabled>
              Choose your state
            </option>
            {STATE_OPTIONS.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          <p id="join-state-hint" className="mt-2 text-xs text-ink-soft sm:text-sm">
            Used for GST on your invoices.
          </p>
        </div>
      ) : null}
      <div>
        <label htmlFor="join-password" className="block text-xs font-medium sm:text-sm">
          Choose a password
          <RequiredMark />
        </label>
        <div className="relative">
          <input
            id="join-password"
            name="password"
            type={revealed ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            readOnly={isPending}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={`join-password-hint${describedBy === undefined ? "" : ` ${describedBy}`}`}
            className={`${INPUT_CLASSES} pr-12`}
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
          >
            {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        </div>
        <p id="join-password-hint" className="mt-2 text-xs text-ink-soft sm:text-sm">
          {PASSWORD_RULE}
        </p>
      </div>

      <label htmlFor="join-agree" className="flex cursor-pointer items-start gap-3 text-xs text-ink-soft sm:text-sm">
        <input
          id="join-agree"
          name={AGREE_FIELD}
          type="checkbox"
          value={AGREE_VALUE}
          required
          checked={agreed}
          disabled={isPending}
          onChange={(event) => setAgreed(event.target.checked)}
          aria-describedby={describedBy}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
        />
        <span>
          I agree to the{" "}
          <a href={legalLinks.terms} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
            Terms
          </a>{" "}
          and the{" "}
          <a href={legalLinks.privacy} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
            Privacy Notice
          </a>
          .<RequiredMark />
        </span>
      </label>

      {error}

      <TurnstileWidget action="join" resetKey={state} />

      <SubmitButton disabled={isPending || cooldown.sendSeconds > 0} className="w-full py-3 sm:py-3.5">
        {confirmsCodes ? (isPending ? "Sending your code…" : "Email me a code") : isPending ? "One moment…" : "Continue"}
      </SubmitButton>
      {isPaidChoice(choice) ? <p className="text-center text-xs text-ink-soft sm:text-sm">You pay on the next page.</p> : null}
      {signInLine}
    </form>
  );
}
