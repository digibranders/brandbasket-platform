import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { skipIntakeAction } from "@/app/app-host/(protected)/personalize/actions";
import { IntakeAside } from "@/components/intake/intake-aside";
import { IntakeSummary } from "@/components/intake/intake-summary";
import { QuestionForm } from "@/components/intake/question-form";
import { STACK } from "@/components/v2/classes";
import { ledgerRows, ledgerSummary } from "@/lib/checkout-ledger";
import { SERVICE_KEY_OF } from "@/lib/first-look";
import { INTAKE_STEP_PARAM, INTAKE_SUMMARY_STEP, personalizeHref } from "@/lib/intake/links";
import { firstUnanswered, questionBefore, questionFor, questionPosition, summaryRows, unansweredCount, visibleQuestions } from "@brandbasket/shared/lib/intake/questions";
import { MEMBER_HOME, readSelectedServices } from "@/lib/membership";
import { getCustomerBusinessEntry, requireCustomerAccess } from "@/lib/server/customer-access";
import { loadIntake } from "@/lib/server/intake";
import { loadMembershipCheckout } from "@/lib/server/membership-checkout";

export const metadata: Metadata = { title: "Personalise your setup" };

interface PersonalizePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/**
 * The short questions between creating an account and paying. The services are already chosen (the address names them), so
 * this personalises what they chose and never recommends a plan. Where the customer is lives in the address (`?q=`), and
 * every answer is saved as it is given, so a refresh or Back resumes. Open to the account a sign-up opens, like the checkout.
 */
export default async function PersonalizePage({ searchParams }: PersonalizePageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const entry = await getCustomerBusinessEntry(tenant.userId, tenant.businessId);
  // Already a member: the questions are for the account that has not paid yet.
  if (entry.kind !== "listing") redirect(MEMBER_HOME);

  const params = await searchParams;
  const services = readSelectedServices(params);
  const keys = services.map((id) => SERVICE_KEY_OF[id]);
  const [{ answers }, view] = await Promise.all([loadIntake(tenant), loadMembershipCheckout({ tenant, billing }, "managed", services, new Date())]);

  const rawStep = params[INTAKE_STEP_PARAM];
  const step = Array.isArray(rawStep) ? rawStep[0] : rawStep;
  const open = firstUnanswered(keys, answers);
  const question = step === undefined || step === INTAKE_SUMMARY_STEP ? undefined : questionFor(step);
  const asked = question !== undefined && visibleQuestions(keys, answers).some((entry) => entry.field === question.field);
  // No step names where to start: the first question still open, or the summary when everything has an answer.
  if (step === undefined) redirect(personalizeHref(services, open === null ? INTAKE_SUMMARY_STEP : open.field));
  if (step !== INTAKE_SUMMARY_STEP && !asked) redirect(personalizeHref(services, INTAKE_SUMMARY_STEP));

  const plan = view.plan;
  const summary = plan === null ? null : ledgerSummary({ planInitialAmountCents: plan.initialAmountCents, currency: plan.currency, taxRateBasisPoints: plan.taxRateBasisPoints, forfeited: view.forfeited, hasEverPaid: view.hasEverPaid }, view.services, null);
  const prices = Object.fromEntries(MONTHLY_ADD_ON_IDS.map((id) => [id, formatMoney(bundleLines([id], plan?.currency ?? "INR")[0]?.listCents ?? 0, plan?.currency ?? "INR")])) as Record<MonthlyAddOnId, string>;
  const aside =
    plan === null || summary === null ? null : (
      <IntakeAside
        rows={ledgerRows(summary, plan.currency, null)}
        summary={summary}
        currency={plan.currency}
        gstBasisPoints={plan.taxRateBasisPoints}
        changeHref={step === INTAKE_SUMMARY_STEP ? null : personalizeHref(services, INTAKE_SUMMARY_STEP)}
      />
    );

  const position = asked ? questionPosition(keys, answers, question.field) : null;
  const previous = asked ? questionBefore(keys, answers, question.field) : null;
  const saved = asked ? answers[question.field] : null;
  const skip = (
    <form action={skipIntakeAction}>
      <input type="hidden" name="services" value={services.join(",")} />
      <button type="submit" className="text-[0.9375rem] font-semibold text-ink underline decoration-line underline-offset-4">
        Skip for now
      </button>
    </form>
  );

  return (
    <div className={STACK}>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
        <section className="grid gap-6 rounded-lift bg-surface p-6 shadow-lift sm:p-8" aria-label="Personalise your setup">
          {asked && position !== null ? (
            <>
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.9375rem] text-ink-2">
                    Question {position.number} of {position.total}
                  </p>
                  {skip}
                </div>
                <div role="progressbar" aria-label={`Question ${position.number} of ${position.total}`} aria-valuemin={1} aria-valuemax={position.total} aria-valuenow={position.number} className="h-1 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${(position.number / position.total) * 100}%` }} />
                </div>
                {question.group === "common" ? null : (
                  <p className="text-[0.9375rem] text-ink-2">Asked because you chose {addOnById(services.find((id) => SERVICE_KEY_OF[id] === question.group) ?? "managed-website").title}.</p>
                )}
              </div>
              <QuestionForm
                key={question.field}
                field={question.field}
                kind={question.kind}
                title={question.title}
                hint={question.hint}
                options={question.options(answers)}
                saved={Array.isArray(saved) ? saved : saved === null ? [] : [String(saved)]}
                services={services.join(",")}
                backHref={previous === null ? null : personalizeHref(services, previous.field)}
                optional={question.optional === true}
              />
            </>
          ) : (
            <IntakeSummary
              rows={summaryRows(keys, answers)}
              services={services}
              prices={prices}
              currency={plan?.currency ?? "INR"}
              unanswered={unansweredCount(keys, answers)}
              firstUnansweredHref={open === null ? null : personalizeHref(services, open.field)}
            />
          )}
        </section>
        {aside}
      </div>
    </div>
  );
}
