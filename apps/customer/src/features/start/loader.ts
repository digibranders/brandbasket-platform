import "server-only";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import {
  firstUnanswered,
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
import { ledgerRows, ledgerSummary, type LedgerRow } from "../checkout/rules/ledger";
import { readSelectedServices } from "../checkout/rules/membership";
import { loadBusinessEntry } from "../checkout/server/entry";
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
  /** Each catalogue service's list price a month, formatted, from the shared bundle prices. */
  readonly prices: Readonly<Record<MonthlyAddOnId, string>>;
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
}

export interface StartView {
  readonly services: readonly MonthlyAddOnId[];
  readonly step: { readonly kind: "question"; readonly question: StartQuestion } | { readonly kind: "summary"; readonly summary: StartSummary };
  /** Null when no plan is on sale in the business's currency: the aside is then left out. */
  readonly aside: Loaded<StartAside | null>;
}

type Params = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Reads the questions for the signed-in business, or redirects: a member (the business has paid) goes Home, no `q` goes to the
 * first unanswered question (or the summary when all are answered), and a `q` naming a question not asked for this basket goes
 * to the summary. The caller has run the guard.
 */
export async function loadStart(customer: CustomerContext, params: Params): Promise<StartView> {
  const entry = await loadBusinessEntry(customer);
  // Already a member: the questions are for the account that has not paid yet.
  if (entry.kind !== "listing") redirect("/");

  const services = readSelectedServices(params);
  const keys = services.map((id) => SERVICE_KEY_OF[id]);
  const { answers } = await loadIntake(customer.tenant);

  const rawStep = params[INTAKE_STEP_PARAM];
  const step = Array.isArray(rawStep) ? rawStep[0] : rawStep;
  const open = firstUnanswered(keys, answers);
  const question = step === undefined || step === INTAKE_SUMMARY_STEP ? undefined : questionFor(step);
  const asked = question !== undefined && visibleQuestions(keys, answers).some((each) => each.field === question.field);
  if (step === undefined) redirect(startHref(services, open === null ? INTAKE_SUMMARY_STEP : open.field));
  if (step !== INTAKE_SUMMARY_STEP && !asked) redirect(startHref(services, INTAKE_SUMMARY_STEP));

  const onSummary = !asked;
  const aside = load("start.aside", async (): Promise<StartAside | null> => {
    const view = await loadMembershipCheckout(customer, "managed", services, new Date());
    const { plan } = view;
    if (plan === null) return null;
    const pricing = { planInitialAmountCents: plan.initialAmountCents, currency: plan.currency, taxRateBasisPoints: plan.taxRateBasisPoints, forfeited: view.forfeited, hasEverPaid: view.hasEverPaid };
    const summary = ledgerSummary(pricing, view.services, null);
    return {
      rows: ledgerRows(summary, plan.currency, null),
      total: formatMoney(summary.totalCents, plan.currency),
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
  const prices = Object.fromEntries(
    MONTHLY_ADD_ON_IDS.map((id) => [id, formatMoney(bundleLines([id], currency)[0]?.listCents ?? 0, currency)]),
  ) as Record<MonthlyAddOnId, string>;
  return {
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
    aside: await aside,
  };
}
