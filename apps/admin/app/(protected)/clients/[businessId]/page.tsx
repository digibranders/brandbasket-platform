import { findClientIntake, findSiteSetting, listActivityForBusiness, listAssignableSupportStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { staffCan } from "@brandbasket/shared/lib/access";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { intakeServicesOf, summaryRows } from "@brandbasket/shared/lib/intake/questions";
import { ANSWER_STEPS, stepInfo } from "@brandbasket/shared/lib/onboarding/steps";
import { SETUP_CALL_URL_KEY, readSetupCallUrl } from "@brandbasket/shared/lib/setup-call-link";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { ActivityList } from "@/components/activity-list";
import { SECTION_TITLE } from "@/components/console/classes";
import { ExceptionsStrip, OverviewNextStepCard, ServiceCards } from "@/components/console/client-overview-cards";
import { CustomerMirrorPanel } from "@/components/console/customer-mirror-panel";
import { Quiet, Section } from "@/components/console/section";
import { TryAgain } from "@/components/console/try-again";
import { overviewCard } from "@/lib/client-next-step";
import { clientTabHref, forwardedNoticeHref } from "@/lib/client-tabs";
import { loadOverviewReads, readOnce } from "@/lib/server/client-overview";
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
  const [overview, recent, intake, setupCallSetting] = await Promise.all([
    loadOverviewReads({ client, now, seesMoney }),
    readOnce("activity", async () => ({
      rows: await listActivityForBusiness(db, client.businessId, RECENT_SHOWN),
      staff: await listAssignableSupportStaff(db),
    })),
    readOnce("intake", () => findClientIntake(db, client.businessId)),
    findSiteSetting(db, SETUP_CALL_URL_KEY).catch(() => null),
  ]);
  const reading = setupCallSetting === null ? null : readSetupCallUrl(setupCallSetting.value);
  const fallbackCallUrl = reading !== null && reading.ok ? reading.url : null;
  const card = overviewCard({ client, now, result: overview.exceptions, servicesToSetUp: overview.toSetUp });
  const done = new Set(client.completedSteps);
  // The kickoff exception opens the one kickoff prompt for the booked call that ended.
  const booked = overview.booking.ok ? overview.booking.value : null;
  const kickoffPrompt = booked?.endsAt ? { businessName: client.businessName, endsAt: booked.endsAt } : undefined;

  return (
    <>
      <ExceptionsStrip
        businessId={client.businessId}
        exceptions={overview.exceptions.exceptions}
        unreadable={overview.exceptions.unreadable}
        kickoffPrompt={kickoffPrompt}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-1 gap-8">
        <OverviewNextStepCard card={card} businessId={client.businessId} kickoffPrompt={kickoffPrompt} />

        {overview.services.ok && overview.services.value.length > 0 ? (
          <section aria-labelledby="services-title">
            <h2 id="services-title" className={SECTION_TITLE}>
              Services
            </h2>
            <div className="mt-2">
              <ServiceCards businessId={client.businessId} services={overview.services.value} linkTo="services" />
            </div>
          </section>
        ) : null}

        {overview.booking.ok ? (
          <CustomerMirrorPanel client={client} booking={overview.booking.value} now={now} fallbackCallUrl={fallbackCallUrl} />
        ) : (
          <ReadFailed title="We could not load what the customer sees" />
        )}

        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className={`${SECTION_TITLE} flex items-baseline justify-between`}>
            What happened
            <Link href={`${clientTabHref(client.businessId, "requests")}#activity`} className="text-xs font-semibold text-ink-2 hover:text-ink">
              All activity
            </Link>
          </h2>
          <div className="mt-2">
            {recent.ok ? (
              <ActivityList rows={recent.value.rows} staffNames={new Map(recent.value.staff.map((member) => [member.userId, member.name]))} />
            ) : (
              <ReadFailed title="We could not load the history" />
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-8">
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

        {!seesMoney ? null : (
          <Section title="Money">
            <BillingFacts client={client} state={clientPaymentState(client.billing, now)} packageFacts={null} />
          </Section>
        )}

        <Section title="What they told us" aside={!intake.ok || intake.value === null ? undefined : intake.value.completedAt === null ? "Not finished" : "Answered before paying"}>
          {!intake.ok ? (
            <ReadFailed title="We could not load what they told us" />
          ) : intake.value === null ? (
            <Quiet>Not asked. They signed up before the short questions existed, or have not reached them.</Quiet>
          ) : (
            <Facts
              items={summaryRows(
                intakeServicesOf(intake.value.askedForServices),
                {
                  businessType: intake.value.businessType,
                  businessSubtype: intake.value.businessSubtype,
                  primaryGoal: intake.value.primaryGoal,
                  websiteState: intake.value.websiteState,
                  existingWebsiteUrl: intake.value.existingWebsiteUrl,
                  primaryAction: intake.value.primaryAction,
                  designDirection: intake.value.designDirection,
                  socialChannels: intake.value.socialChannels,
                  searchScope: intake.value.searchScope,
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
    </>
  );
}

/** One panel whose read failed: it says so and offers to read it again, and the rest of the page stays. */
function ReadFailed({ title }: { readonly title: string }): ReactElement {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-neg-border bg-neg-wash p-4">
      <p className="min-w-0 flex-1 text-sm font-semibold text-neg-text">{title}. Nothing was changed.</p>
      <TryAgain />
    </div>
  );
}

