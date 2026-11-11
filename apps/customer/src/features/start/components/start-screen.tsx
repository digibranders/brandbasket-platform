import Link from "next/link";
import { addOnById, PLAN_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { Panel, PanelError } from "@/components";
import { Badge, Meter } from "@/ui";
import { formatOutOf } from "@/lib/format";
import { servicesAfterToggle } from "../../checkout/rules/membership";
import type { StartAside, StartSummary, StartView } from "../loader";
import { startHref } from "../rules";
import { ContinueButton, ToggleServiceButton } from "./basket-form";
import { QuestionForm } from "./question-form";

/**
 * The short questions between creating an account and paying (old /personalize). The services are already chosen, so this
 * personalises what they chose and never recommends a plan.
 */
export function StartScreen({ view }: { readonly view: StartView }) {
  const basket = view.services.join(",");
  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <section aria-label="Personalise your setup" className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 lg:col-span-2">
        {view.step.kind === "question" ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-end gap-3">
                <ContinueButton services={basket} variant="ghost" size="sm">
                  Skip for now
                </ContinueButton>
              </div>
              <Meter
                label={<span className="sr-only">Progress</span>}
                value={view.step.question.number}
                max={view.step.question.total}
                valueText={`Question ${formatOutOf(view.step.question.number, view.step.question.total)}`}
              />
              {view.step.question.askedBecause === null ? null : <p className="type-meta">{view.step.question.askedBecause}</p>}
            </div>
            <QuestionForm key={view.step.question.field} question={view.step.question} services={basket} />
          </>
        ) : (
          <SummaryStep summary={view.step.summary} services={view.services} basket={basket} />
        )}
      </section>
      {view.aside.ok ? (
        view.aside.data === null ? null : <Aside aside={view.aside.data} />
      ) : (
        <PanelError failure={view.aside.error} what="your prices" />
      )}
    </div>
  );
}

function SummaryStep({ summary, services, basket }: { readonly summary: StartSummary; readonly services: StartView["services"]; readonly basket: string }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="type-title text-ink">Here is what we understood</h1>
        <p className="type-body text-ink-3">We will carry this into your kickoff call. It is a starting point, not a brief, and nothing in it is final.</p>
      </header>

      <section aria-labelledby="start-services" className="flex flex-col gap-2">
        <h2 id="start-services" className="type-section text-ink">Your services</h2>
        <p className="type-body text-ink-3">Already chosen by you. Add another before checkout and any package saving updates by itself.</p>
        <ul className="divide-y divide-border-subtle rounded-control border border-border">
          {PLAN_ADD_ON_IDS.map((id) => {
            const on = services.includes(id);
            const onlyOne = on && servicesAfterToggle(services, id) === services;
            const title = addOnById(id).title;
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="flex flex-col">
                  <span className="type-sub text-ink">{title}</span>
                  <span className="type-meta tabular-nums">{summary.prices[id]} a month</span>
                </span>
                <ToggleServiceButton services={basket} toggle={id} variant="secondary" disabled={onlyOne} aria-label={`${on ? "Remove" : "Add"} ${title}`}>
                  {on ? "Remove" : "Add"}
                </ToggleServiceButton>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="start-answers" className="flex flex-col gap-2">
        <h2 id="start-answers" className="type-section text-ink">About your business</h2>
        <dl className="divide-y divide-border-subtle rounded-control border border-border">
          {summary.rows.map((row) => (
            <div key={row.field} className="grid grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-3">
              <dt className="type-body text-ink-3">{row.label}</dt>
              <dd className={`min-w-0 break-words type-body ${row.value === null ? "text-ink-3" : "text-ink"} max-sm:col-span-2 max-sm:row-start-2`}>
                {row.value ?? "We will ask on the call"}
              </dd>
              <Link href={startHref(services, row.field)} className="justify-self-end type-sub">
                {row.value === null ? "Answer" : "Edit"}
              </Link>
            </div>
          ))}
        </dl>
        {summary.unanswered > 0 && summary.firstUnansweredHref !== null ? (
          <p className="type-body text-ink-3">
            {summary.unanswered === 1 ? "One question is" : `${summary.unanswered} questions are`} still open for your services.{" "}
            <Link href={summary.firstUnansweredHref}>Answer {summary.unanswered === 1 ? "it" : "them"}</Link>, or skip them and we will cover them on the
            call.
          </p>
        ) : null}
      </section>

      <div className="flex justify-end border-t border-border-subtle pt-4">
        <ContinueButton services={basket} variant="primary">
          Continue to checkout
        </ContinueButton>
      </div>
    </div>
  );
}

/** The services already chosen, with the price the checkout will take: the checkout's own rows and figures. */
function Aside({ aside }: { readonly aside: StartAside }) {
  return (
    <Panel title="Your services" action={<Badge>Chosen by you</Badge>}>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {aside.rows.map((row) => (
          <li key={row.key} className="flex justify-between gap-4 py-2 type-body text-ink-2">
            <span className={row.tone === "save" ? "text-pos-text" : undefined}>{row.label}</span>
            <span className={`${row.tone === "free" ? "" : "tabular-nums"} ${row.tone === "plain" ? "" : "text-pos-text"}`}>{row.amount}</span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-4 py-3">
          <span className="type-sub text-ink">Due today</span>
          <span className="type-metric-sm text-ink">{aside.total}</span>
        </li>
      </ul>
      <div className="flex flex-col gap-2">
        {aside.taxed ? <p className="type-meta">GST is included in every price.</p> : null}
        {aside.adCredit === null ? null : <p className="type-body text-pos-text">{aside.adCredit}</p>}
        {aside.changeHref === null ? null : <Link href={aside.changeHref} className="type-sub">Change services</Link>}
      </div>
    </Panel>
  );
}
