"use client";

import type { BillingInterval } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, startTransition, type FormEvent, type ReactNode } from "react";
import { startSignupCheckoutAction, type CheckoutSignupResult } from "@/features/entry/actions";
import type { PhoneCountryChoice } from "@/features/entry/components/sign-up-form";
import { TurnstileWidget } from "@/features/entry/components/turnstile";
import { CHECKOUT_AGREE_MESSAGE } from "@/features/entry/rules/checkout-signup-messages";
import { SIGN_IN_PATH } from "@/features/entry/rules/account-entry";
import { AGREE_FIELD, AGREE_VALUE, START_FIELD } from "@/features/entry/rules/join-form";
import type { StartPrefill } from "@/features/entry/rules/start-token";
import { actionFail } from "@/lib/action-result";
import { useGuardedActionState } from "@/lib/use-guarded-action-state";
import { Badge, Banner, Segmented } from "@/ui";
import { cx } from "@/ui/cx";
import { applyCodeAction, startPaymentAction } from "../actions";
import { billingParamValue, MEMBERSHIP_BILLING_PARAM, membershipHrefWithServices } from "../rules/membership";
import { useOpeningPayment } from "../rules/opening-payment";
import { checkoutLead, checkoutSteps } from "../rules/plans";
import { basketView, payLabel, purchasableServices, type SignupBasketTable } from "../rules/signup-basket";
import { CodeDisclosure } from "./code-disclosure";
import { DetailsFields } from "./details-fields";
import { OrderPanel } from "./order-panel";
import { PayBar, PayBarSpacer } from "./pay-bar";
import { ServiceCards } from "./service-cards";

/*
 * The one-screen checkout for a new visitor (plan 64, docs/design/checkout-one-screen.html, version 2): pick the services, give
 * the details, pay. Pay is two posts in a row, because the session the first one starts cannot be read by the request that
 * made it: startSignupCheckoutAction opens the account and signs the visitor in, then startPaymentAction opens the payment
 * and sends the browser to the provider. The second sends no details: the first has saved them.
 */

/** The fields the screen draws an error under. A refusal that names any other goes in the banner above Pay. */
const FIELDS_ON_SCREEN: ReadonlySet<string> = new Set(["name", "businessName", "email", "phone", "stateCode", "hasGstin", "gstin", "legalName", "addressLine1", "addressLine2", "postalCode", "city", "agree"]);

/** What only a visitor without an account is asked: the details, the robot check and the ad token. */
export interface NewAccountDetails {
  readonly siteKey: string | null;
  readonly phoneCountries: readonly PhoneCountryChoice[];
  readonly defaultPhoneCountry: string;
  readonly prefill: StartPrefill | null;
  /** The sealed token that named an ad, sent back so the account keeps which ad it came from. */
  readonly startToken: string | null;
}

export interface SignupCheckoutScreenProps {
  readonly table: SignupBasketTable;
  /** The services to open on; the screen sells only those on sale. May be none. */
  readonly initialServices: readonly string[];
  /**
   * "new": a visitor with no account, who gives their details and pays in two posts. "signed-in": a signed-in unpaid sign-up
   * owner, whose details are saved already: Pay posts the payment alone. The page re-renders in "signed-in" the moment the first
   * post signs the visitor in, and this component stays mounted through it, so the chain in flight is not lost.
   */
  readonly account: "new" | "signed-in";
  /** Present wherever the screen can be a visitor's. Without it the screen is never asked for details. */
  readonly details?: NewAccountDetails;
  /** False where the route already draws the page's header and main (the pay frame of /checkout). */
  readonly standalone?: boolean;
  /** Back from the provider after a payment that did not go through. */
  readonly paymentFailed?: boolean;
}

/** The second post: the same services and billing, tier managed, and no details. */
function paymentForm(opened: FormData): FormData {
  const payment = new FormData();
  payment.set("tier", "managed");
  payment.set("billing", String(opened.get("billing") ?? ""));
  for (const service of opened.getAll("service")) payment.append("service", service);
  return payment;
}

/** The code step: the typed code against the same services. */
function codeForm(opened: FormData, code: string): FormData {
  const applying = new FormData();
  applying.set("referralCode", code);
  for (const service of opened.getAll("service")) applying.append("service", service);
  return applying;
}

/** The full checkout for these services, paid the way the visitor chose: where a code in force is shown with what it is worth. */
function checkoutHref(table: SignupBasketTable, opened: FormData): string {
  const href = membershipHrefWithServices("managed", purchasableServices(table, opened.getAll("service").map(String)));
  return opened.get("billing") === billingParamValue("year") ? `${href}&${MEMBERSHIP_BILLING_PARAM}=${billingParamValue("year")}` : href;
}

export function SignupCheckoutScreen({ table, initialServices, account, details, standalone = true, paymentFailed = false }: SignupCheckoutScreenProps) {
  const [ticked, setTicked] = useState<readonly MonthlyAddOnId[]>(() => purchasableServices(table, initialServices));
  const [interval, setBilling] = useState<BillingInterval>("month");
  const [agreed, setAgreed] = useState(false);
  const [agreeMissing, setAgreeMissing] = useState(false);
  // Once the account is open a refused payment is tried again without opening another: the address would then "already have an account".
  // `opened` is the same fact for drawing: the details it was opened with are locked, so an edit cannot be silently ignored.
  const accountOpen = useRef(false);
  const [opened, setOpened] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const router = useRouter();

  const run = async (previous: CheckoutSignupResult | null, formData: FormData): Promise<CheckoutSignupResult> => {
    if (account === "new" && !accountOpen.current) {
      const result = await startSignupCheckoutAction(previous, formData);
      if (!result.ok) return result;
      accountOpen.current = true;
      setOpened(true);
    }
    // A code typed is applied now, and the payment is the checkout's to take: it shows the discount, which this screen cannot.
    const code = String(formData.get("referralCode") ?? "").trim();
    if (code !== "") {
      const applied = await applyCodeAction(null, codeForm(formData, code));
      if (!applied.ok) {
        setCodeOpen(true);
        return actionFail(applied.message, applied.fieldErrors);
      }
      router.push(checkoutHref(table, formData));
      return { ok: true };
    }
    const payment = await startPaymentAction(null, paymentForm(formData));
    return payment.ok ? { ok: true } : actionFail(payment.message, payment.fieldErrors);
  };
  const [state, formAction, pending, formRef] = useGuardedActionState(run, null);
  const opening = useOpeningPayment(pending, state);

  const view = basketView(table, ticked, interval);
  const failure = state !== null && !state.ok && !pending ? state : null;
  const codeError = failure?.fieldErrors?.referralCode;
  const bannerMessage = failure !== null && codeError === undefined && (failure.field === undefined || !FIELDS_ON_SCREEN.has(failure.field)) ? failure.message : null;
  const agreeError = !agreed && agreeMissing ? CHECKOUT_AGREE_MESSAGE : failure?.fieldErrors?.agree;
  const inIndia = table.currency === "INR";
  // The details stay on screen, locked, for the mount that opened the account; a signed-in unpaid owner never sees them.
  const showDetails = details !== undefined && (account === "new" || opened);
  // The robot check and the ad token belong to the first post only.
  const first = account === "new" && !opened ? details : undefined;
  const label = payLabel(view);

  const toggle = (id: MonthlyAddOnId, on: boolean): void => {
    setTicked(purchasableServices(table, on ? [...view.services, id] : view.services.filter((service) => service !== id)));
  };

  const agree = (next: boolean): void => {
    setAgreed(next);
    if (next) setAgreeMissing(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (opening || view.services.length === 0) return;
    if (!agreed) {
      setAgreeMissing(true);
      return;
    }
    const sent = new FormData(event.currentTarget);
    startTransition(() => formAction(sent));
  };

  return (
    <Frame standalone={standalone} signIn={account === "new"}>
        <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
          <input type="hidden" name="billing" value={billingParamValue(interval)} />
          {view.services.map((service) => (
            <input key={service} type="hidden" name="service" value={service} />
          ))}
          {agreed ? <input type="hidden" name={AGREE_FIELD} value={AGREE_VALUE} /> : null}
          {first?.startToken == null ? null : <input type="hidden" name={START_FIELD} value={first.startToken} />}

          {paymentFailed ? (
            <Banner tone="neg">
              <strong className="font-semibold">Payment declined.</strong> We couldn’t confirm that payment, so nothing has been recorded. You can try again below.
            </Banner>
          ) : null}

          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <h1 className="type-title text-ink">Your plan</h1>
              <p className="font-sans text-sm text-ink-2">{checkoutLead(table.currency, table.taxRateBasisPoints)}</p>
            </div>
            <Segmented
              aria-label="How you pay"
              value={interval}
              onValueChange={(next) => setBilling(next === "year" ? "year" : "month")}
              options={[
                { value: "month", label: "Monthly" },
                {
                  value: "year",
                  label: (
                    <span className="inline-flex items-center gap-2">
                      Yearly <Badge tone="pos">Save 10%</Badge>
                    </span>
                  ),
                },
              ]}
            />
          </header>

          <ServiceCards table={table} services={view.services} interval={interval} onToggle={toggle} />

          <div className="grid items-start gap-6 lg:grid-cols-12">
            {showDetails ? (
              <DetailsFields
                inIndia={inIndia}
                errors={failure?.fieldErrors}
                accountExists={failure?.accountExists === true}
                phoneCountries={details.phoneCountries}
                defaultPhoneCountry={details.defaultPhoneCountry}
                prefill={details.prefill}
                locked={opened}
              />
            ) : null}
            <aside className={cx("lg:sticky lg:top-6 lg:col-span-5", !showDetails && "lg:col-start-8")}>
              <OrderPanel
                view={view}
                payLabel={label}
                pending={opening}
                agreed={agreed}
                onAgreedChange={agree}
                agreeError={agreeError}
                failure={bannerMessage}
                footer={<CodeDisclosure open={codeOpen} onOpenChange={setCodeOpen} error={codeError} />}
              >
                {first === undefined ? null : <TurnstileWidget siteKey={first.siteKey} action="join" resetKey={state} />}
              </OrderPanel>
            </aside>
          </div>

          <section aria-labelledby="signup-next" className="flex flex-col gap-4 border-t border-border pt-6">
            <h2 className="type-sub text-ink" id="signup-next">
              What happens next
            </h2>
            <ol aria-label="What happens next" className="m-0 grid list-none gap-3 p-0 md:grid-flow-col md:auto-cols-fr md:gap-0">
              {checkoutSteps(view.services).map((step, index) => (
                <li
                  key={step.title}
                  aria-current={index === 0 ? "step" : undefined}
                  className="relative flex flex-col pl-6 type-meta md:pt-6 md:pl-0 md:before:absolute md:before:inset-x-0 md:before:top-1.5 md:before:h-0.5 md:before:bg-border"
                >
                  <span aria-hidden="true" className={cx("absolute top-0.5 left-0 size-3.5 rounded-full border-2 md:top-0", index === 0 ? "border-c1 bg-accent-wash" : "border-border-control bg-surface")} />
                  <span className="type-sub text-ink">{step.title}</span>
                  <span className="max-md:hidden">{step.note}</span>
                </li>
              ))}
            </ol>
          </section>

          <PayBar due={view.due} label={label} disabled={view.services.length === 0} pending={opening} />
          <PayBarSpacer />
        </form>
    </Frame>
  );
}

/**
 * The page around the screen: the topbar and main of a public page, or nothing where the route already draws them. Which one
 * never changes for a route, so the screen below keeps its place when the page is drawn again.
 */
function Frame({ standalone, signIn, children }: { readonly standalone: boolean; readonly signIn: boolean; readonly children: ReactNode }) {
  if (!standalone) return <>{children}</>;
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-topbar items-center gap-2 border-b border-border bg-surface px-4 md:px-8">
        <div className="flex flex-1 items-center">
          <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket" width={130} height={22} unoptimized priority />
        </div>
        {signIn ? (
          <p className="type-meta">
            Already have an account? <Link href={SIGN_IN_PATH}>Sign in</Link>
          </p>
        ) : null}
      </header>
      <main id="page" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-6 md:px-8 lg:pb-10">
        {children}
      </main>
    </div>
  );
}
