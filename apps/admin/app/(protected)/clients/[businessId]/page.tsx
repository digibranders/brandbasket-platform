import { findClientIntake, findSetupCallBooking, listActivityForBusiness, listAssignableSupportStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { staffCan } from "@brandbasket/shared/lib/access";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { intakeServicesOf, summaryRows } from "@brandbasket/shared/lib/intake/questions";
import { ANSWER_STEPS, stepInfo } from "@brandbasket/shared/lib/onboarding/steps";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { ActivityList } from "@/components/activity-list";
import { buttonPrimary } from "@/components/console/buttons";
import { LIFT, SECTION_TITLE } from "@/components/console/classes";
import { Quiet, Section } from "@/components/console/section";
import { overviewNextStep } from "@/lib/client-next-step";
import { clientTabHref, forwardedNoticeHref } from "@/lib/client-tabs";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { BillingFacts, Facts, When } from "./parts";

export const metadata: Metadata = { title: "Client" };

/** How many lines of history the Overview shows. */
const RECENT_SHOWN = 6;

export default async function ClientOverviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "");
  // An action redirected here with a notice that belongs to another tab: pass it on with the same query.
  const forward = forwardedNoticeHref(client.businessId, await searchParams);
  if (forward !== null) redirect(forward);

  const db = getStaffDb();
  const now = new Date();
  const seesMoney = staffCan(granted.staff.role, "money");
  const [booking, recent, staff, addOns, intake] = await Promise.all([
    findSetupCallBooking(db, client.businessId),
    listActivityForBusiness(db, client.businessId, RECENT_SHOWN),
    listAssignableSupportStaff(db),
    seesMoney ? loadClientAddOns(client.businessId, now) : Promise.resolve(null),
    findClientIntake(db, client.businessId),
  ]);
  const next = overviewNextStep(client, now);
  const projectHref = clientTabHref(client.businessId, "project");
  const done = new Set(client.completedSteps);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid gap-8">
        <section aria-labelledby="next-step-title" className={`${LIFT} p-5`}>
          <h2 id="next-step-title" className="font-display text-[0.9375rem] font-semibold text-ink">
            Next step
          </h2>
          {next === null ? (
            <p className="mt-2 text-sm text-ink-2">Nothing is waiting on us.</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{next.label}</p>
              <Link href={next.anchor === null ? projectHref : `${projectHref}#${next.anchor}`} className={buttonPrimary}>
                Open project
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className={`${SECTION_TITLE} flex items-baseline justify-between`}>
            What happened
            <Link href={clientTabHref(client.businessId, "activity")} className="text-xs font-semibold text-ink-2 hover:text-ink">
              All activity
            </Link>
          </h2>
          <div className="mt-2">
            <ActivityList rows={recent} staffNames={new Map(staff.map((member) => [member.userId, member.name]))} />
          </div>
        </section>
      </div>

      <div className="grid gap-8">
        <Section title="Owner">
          <Facts
            items={[
              { label: "Name", value: client.owner?.name ?? "No owner on this business" },
              {
                label: "Email",
                value:
                  client.owner === null || client.owner.email === null ? null : (
                    <a href={`mailto:${client.owner.email}`} className="link-underline break-all">
                      {client.owner.email}
                    </a>
                  ),
              },
              // An owner who joined on the entry page signs in with this number and has no email address.
              ...(client.owner?.phone == null
                ? []
                : [{ label: "Mobile", value: <span className="tabular-nums">{displayPhoneText(client.owner.phone) ?? client.owner.phone}</span> }]),
              { label: "Billed in", value: BILLING_CURRENCY_LABELS[client.currency] },
              { label: "Joined", value: <When date={client.createdAt} /> },
            ]}
          />
        </Section>

        <Section title="Kickoff call">
          {booking === null ? (
            <Quiet>No kickoff call booked yet.</Quiet>
          ) : (
            <Facts
              items={[
                { label: "Booked on", value: <When date={booking.bookedAt} /> },
                { label: "Call", value: booking.startsAt === null ? "Time not known yet" : <When date={booking.startsAt} /> },
              ]}
            />
          )}
        </Section>

        {addOns === null ? null : (
          <Section title="Money">
            <BillingFacts client={client} state={clientPaymentState(client.billing, now)} packageFacts={addOns.package} />
          </Section>
        )}

        <Section title="What they told us" aside={intake === null ? undefined : intake.completedAt === null ? "Not finished" : "Answered before paying"}>
          {intake === null ? (
            <Quiet>Not asked. They signed up before the short questions existed, or have not reached them.</Quiet>
          ) : (
            <Facts
              items={summaryRows(
                intakeServicesOf(intake.askedForServices),
                {
                  businessType: intake.businessType,
                  businessSubtype: intake.businessSubtype,
                  primaryGoal: intake.primaryGoal,
                  websiteState: intake.websiteState,
                  existingWebsiteUrl: intake.existingWebsiteUrl,
                  primaryAction: intake.primaryAction,
                  designDirection: intake.designDirection,
                  socialChannels: intake.socialChannels,
                  searchScope: intake.searchScope,
                },
              ).map((row) => ({ label: row.label, value: row.value ?? <span className="text-ink-2">Not answered</span> }))}
            />
          )}
        </Section>

        <Section title="Setup answers" aside={`${ANSWER_STEPS.filter((step) => done.has(step)).length} of ${ANSWER_STEPS.length} done`}>
          <ul className="grid gap-y-3">
            {ANSWER_STEPS.map((step) => (
              <li key={step} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-6 items-center justify-center rounded-full ${done.has(step) ? "bg-ink text-white" : "ring-2 ring-inset ring-ink-2/65"}`}
                >
                  {done.has(step) ? <TickIcon className="size-3.5" /> : null}
                </span>
                <span className={done.has(step) ? "" : "text-ink-2"}>
                  {stepInfo(step).title}
                  <span className="sr-only">{done.has(step) ? " (done)" : " (not done)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
