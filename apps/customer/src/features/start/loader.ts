import "server-only";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, readBundleSelection, WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";
import { TRIAL_ADD_ON_IDS, trialEligible, trialPriceCents } from "@brandbasket/shared/lib/billing/trial";
import {
  firstUnanswered,
  intakeServicesOf,
  questionBefore,
  questionFor,
  questionPosition,
  summaryRows,
  unansweredCount,
  visibleQuestions,
  type IntakeOption,
  type IntakeSummaryRow,
} from "@brandbasket/shared/lib/intake/questions";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { redirect } from "next/navigation";
import type { CustomerContext } from "@/lib/guards";
import { formatMoney } from "@/lib/format";
import { load, type Loaded } from "@/lib/loaded";
import { ledgerOffer, ledgerRows, ledgerSummary, type LedgerRow } from "../checkout/rules/ledger";
import { readSelectedServices } from "../checkout/rules/membership";
import { loadBusinessEntry, loadSavedServices } from "../checkout/server/entry";
import { loadMembershipCheckout } from "../checkout/server/membership-checkout";
import { INTAKE_STEP_PARAM, INTAKE_SUMMARY_STEP, SERVICE_KEY_OF, startHref } from "./rules";
import { loadIntake } from "./server";

/* The view behind /start, ported from apps/platform app/app-host/(protected)/personalize/page.tsx. */

export interface StartQuestion {
  readonly field: string;
  readonly kind: "single" | "multi" | "url";
  readonly title: string;
  readonly hint: string;
  readonly options: readonly IntakeOption[];
  readonly saved: readonly string[];
  readonly optional: boolean;
  readonly number: number;
  readonly total: number;
  /** "Asked because you chose Social Media and Ads", or null for the questions everyone is asked. */
  readonly askedBecause: string | null;
  readonly backHref: string | null;
}

export interface StartSummary {
  readonly rows: readonly IntakeSummaryRow[];
  /** Each catalogue service's price, formatted, before "a month": its list price, or "₹1 first month, then ₹2,999" on the offer. */
  readonly prices: Readonly<Partial<Record<MonthlyAddOnId, string>>>;
  readonly unanswered: number;
  readonly firstUnansweredHref: string | null;
}

/** The price aside: the same rows and figures as the checkout's summary. */
export interface StartAside {
  readonly rows: readonly LedgerRow[];
  readonly total: string;
  readonly taxed: boolean;
  readonly adCredit: string | null;
  /** Where "Change services" goes, or null on the summary, which has the controls itself. */
  readonly changeHref: string | null;
  /** The plans this business would get on the first-month offer (plan 63), chosen or not. */
  readonly firstMonthPlans: readonly MonthlyAddOnId[];
}

export interface StartView {
  /**
   * "before-payment": an unpaid sign-up, with its basket and prices beside the questions. "after-payment": a member who has paid,
   * asked the same questions with no price, basket or "Change services" anywhere, and who finishes at Home.
   */
  readonly phase: "before-payment" | "after-payment";
  readonly services: readonly MonthlyAddOnId[];
  readonly step: { readonly kind: "question"; readonly question: StartQuestion } | { readonly kind: "summary"; readonly summary: StartSummary };
  /** Null when no plan is on sale in the business's currency: the aside is then left out. */
  readonly aside: Loaded<StartAside | null>;
}

type Params = Readonly<Record<string, string | string[] | undefined>>;

/** The catalogue ids behind the services a paid business has, for the questions asked about them. */
const BOUGHT_ADD_ON: Readonly<Record<CustomerContext["services"][number], MonthlyAddOnId | null>> = { website: "managed-website", social: "social-media", search: null };

/**
 * The services a member who has paid is asked about: the plan they bought, else the basket the questions were last saved for,
 * else the website alone. Never read from the address: after payment the basket is not theirs to change here.
 */
async function paidServices(customer: CustomerContext): Promise<readonly MonthlyAddOnId[]> {
  const bought = readBundleSelection(customer.services.flatMap((service) => BOUGHT_ADD_ON[service] ?? []));
  if (bought.length > 0) return bought;
  const saved = readBundleSelection(await loadSavedServices(customer));
  return saved.length > 0 ? saved : WEBSITE_ALONE;
}

/**
 * Reads the questions for the signed-in business, or redirects. An account that has not paid is asked them before checkout,
 * with its prices beside them. A member who has paid and not finished is asked them after payment (plan 64, 3.6), with no prices;
 * one who finished goes Home. No `q` goes to the first unanswered question (or the summary when all are answered), and a `q`
 * naming a question not asked for this basket goes to the summary. The caller has run the guard.
 */
export async function loadStart(customer: CustomerContext, params: Params): Promise<StartView> {
  const entry = await loadBusinessEntry(customer);
  const paid = entry.kind !== "listing";
  // Only an account that signed up and paid here is asked afterwards: a client staff invited has its own setup.
  if (paid && entry.signupChoice !== "managed") redirect("/");
  const intake = await loadIntake(customer.tenant);
  if (paid && intake.completedAt !== null) redirect("/");

  const services = paid ? await paidServices(customer) : readSelectedServices(params);
  const keys = intakeServicesOf(services);
  const { answers } = intake;

  const rawStep = params[INTAKE_STEP_PARAM];
  const step = Array.isArray(rawStep) ? rawStep[0] : rawStep;
  const open = firstUnanswered(keys, answers);
  const question = step === undefined || step === INTAKE_SUMMARY_STEP ? undefined : questionFor(step);
  const asked = question !== undefined && visibleQuestions(keys, answers).some((each) => each.field === question.field);
  if (step === undefined) redirect(startHref(services, open === null ? INTAKE_SUMMARY_STEP : open.field));
  if (step !== INTAKE_SUMMARY_STEP && !asked) redirect(startHref(services, INTAKE_SUMMARY_STEP));

  const onSummary = !asked;
  const aside = load("start.aside", async (): Promise<StartAside | null> => {
    // After payment nothing here is priced: the business has paid, and the basket is not theirs to change.
    if (paid) return null;
    const view = await loadMembershipCheckout(customer, "managed", services, new Date());
    const { plan } = view;
    if (plan === null) return null;
    const pricing = { planInitialAmountCents: plan.initialAmountCents, currency: plan.currency, taxRateBasisPoints: plan.taxRateBasisPoints, forfeited: view.forfeited, hasEverPaid: view.hasEverPaid };
    const summary = ledgerSummary(pricing, view.services, null);
    // The checkout's own first-month offer, so this aside shows what Pay will take. The start page is always monthly.
    const firstMonth = ledgerOffer(summary, view.firstMonth, plan.currency, "month");
    const eligible = view.firstMonth;
    return {
      rows: ledgerRows(summary, plan.currency, null, firstMonth),
      total: formatMoney(firstMonth?.firstPaymentCents ?? summary.totalCents, plan.currency),
      firstMonthPlans:
        eligible === null
          ? []
          : TRIAL_ADD_ON_IDS.filter((id) => trialEligible({ service: id, interval: "month", provider: eligible.provider, hadService: eligible.hadService[id] ?? true })),
      taxed: plan.taxRateBasisPoints > 0,
      adCredit: summary.adCredit?.label ?? null,
      changeHref: onSummary ? null : startHref(services, INTAKE_SUMMARY_STEP),
    };
  });

  if (asked) {
    const position = questionPosition(keys, answers, question.field);
    const previous = questionBefore(keys, answers, question.field);
    const saved = answers[question.field];
    const service = services.find((id) => SERVICE_KEY_OF[id] === question.group);
    return {
      phase: paid ? "after-payment" : "before-payment",
      services,
      step: {
        kind: "question",
        question: {
          field: question.field,
          kind: question.kind,
          title: question.title,
          hint: question.hint,
          options: question.options(answers),
          saved: Array.isArray(saved) ? saved : saved === null ? [] : [String(saved)],
          optional: question.optional === true,
          number: position.number,
          total: position.total,
          askedBecause: question.group === "common" || service === undefined ? null : `Asked because you chose ${addOnById(service).title}.`,
          backHref: previous === null ? null : startHref(services, previous.field),
        },
      },
      aside: await aside,
    };
  }

  const currency: MoneyCurrency = customer.currency;
  const loadedAside = await aside;
  const onOffer: readonly MonthlyAddOnId[] = loadedAside.ok && loadedAside.data !== null ? loadedAside.data.firstMonthPlans : [];
  const prices = paid ? {} : Object.fromEntries(
    MONTHLY_ADD_ON_IDS.map((id) => {
      const list = formatMoney(bundleLines([id], currency)[0]?.listCents ?? 0, currency);
      return [id, onOffer.includes(id) ? `${formatMoney(trialPriceCents(currency), currency)} first month, then ${list}` : list];
    }),
  ) as Record<MonthlyAddOnId, string>;
  return {
    phase: paid ? "after-payment" : "before-payment",
    services,
    step: {
      kind: "summary",
      summary: {
        rows: summaryRows(keys, answers),
        prices,
        unanswered: unansweredCount(keys, answers),
        firstUnansweredHref: open === null ? null : startHref(services, open.field),
      },
    },
    aside: loadedAside,
  };
}
