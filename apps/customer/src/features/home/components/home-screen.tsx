import Link from "next/link";
import { kickoffMeetingLink } from "@brandbasket/shared/lib/setup-call-link";
import { PageHeader, Panel, PanelError } from "@/components";
import { BookCallDialog } from "@/features/calls/components/book-call-dialog";
import { KickoffPanel } from "@/features/calls/components/kickoff-panel";
import { BOOK_PROBLEM_TEXT, VIEWER_MESSAGE } from "@/features/calls/rules";
import { PurchasePush } from "@/features/conversions/components/purchase-push";
import type { PurchaseEvent } from "@/features/conversions/purchase-event";
import type { LoadFailure } from "@/lib/loaded";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button, Icon, LinkButton } from "@/ui";
import { NextActionCard, ServiceCard, StatusChip } from "@brandbasket/shared/ui/patterns";
import type { HomePanels, HomeStateView } from "../loader";
import {
  firstName,
  greetingFor,
  homeLede,
  kickoffSteps,
  overviewLede,
  websiteCopy,
  websiteMilestones,
  type NeedsYouItem,
  type WebsiteState,
} from "../rules";
import {
  ActivityPanel,
  ChecklistPanel,
  ComingUpPanel,
  EnquiriesChart,
  HaveReadyPanel,
  IncludedEditsPanel,
  LastThirtyDays,
  NeedsYouPanel,
  NextStepsPanel,
  RoundsPanel,
  ServicesPanel,
  WebsiteStatusPanel,
} from "./panels";

const NEW_REQUEST = "/requests?new=1";

type Services = readonly ("website" | "social" | "search")[];

export interface HomeScreenProps {
  readonly person: { readonly name: string; readonly isPhoneAccount: boolean; readonly role: "owner" | "editor" | "viewer" };
  readonly services: Services;
  readonly view: HomeStateView;
  readonly panels: HomePanels;
  readonly now: Date;
  /** The first payment to report to Tag Manager, only on the welcome visit (?welcome=1). */
  readonly purchase: PurchaseEvent | null;
}

/** The read that decides Home's state failed: say so, never guess a state. */
export function HomeStateError({ failure, name, now }: { readonly failure: LoadFailure; readonly name: string; readonly now: Date }) {
  return (
    <>
      <PageHeader title={`${greetingFor(now)}, ${firstName(name)}`} />
      <Panel className="rounded-panel border border-border bg-surface p-6 shadow-card">
        <PanelError failure={failure} what="your home page" />
      </Panel>
    </>
  );
}

/** Book a call in a header, once calls are open and this member can book. */
function BookCallAction({ view, panels }: { readonly view: HomeStateView; readonly panels: HomePanels }) {
  if (!view.callsOpen || !panels.booking.ok || !panels.booking.data.canBook) return null;
  return (
    <BookCallDialog
      options={panels.booking.data.options}
      bookingUrl={panels.booking.data.bookingUrl}
      trigger={
        <Button icon="CalendarBlank">
          Book a call
        </Button>
      }
    />
  );
}

/** Payment required, payment under review, lapsed: one task each, and nothing else to read. */
function PaymentTask({ view, person, now }: Pick<HomeScreenProps, "view" | "person" | "now">) {
  const header = (
    <PageHeader
      title={`${greetingFor(now)}, ${firstName(person.name)}`}
      description={homeLede([], now)}
    />
  );
  switch (view.state.kind) {
    case "payment_processing":
      return (
        <div className="flex flex-col gap-6">
          {header}
          <NextActionCard
            serviceName="Plan"
            serviceIcon={<Icon name="CreditCard" size="md" />}
            title="Payment under review"
            description="We have your payment and are checking it. Your plan starts as soon as it clears."
            primaryAction={{ label: "View billing", href: "/billing" }}
            statusText="Checking payment"
            statusTone="waiting"
          />
        </div>
      );
    case "lapsed":
      return (
        <div className="flex flex-col gap-6">
          {header}
          <NextActionCard
            serviceName="Plan"
            serviceIcon={<Icon name="CreditCard" size="md" />}
            title="Plan ended"
            description="Your plan has ended. Reactivate it to restart your services."
            primaryAction={{ label: "Reactivate", href: "/billing" }}
            statusText="Plan ended"
            statusTone="error"
          />
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-6">
          {header}
          <NextActionCard
            serviceName="Plan"
            serviceIcon={<Icon name="CreditCard" size="md" />}
            title="Start your plan"
            description="Your plan starts once your first payment goes through."
            primaryAction={{ label: "Pay", href: "/checkout" }}
            statusText="Payment required"
            statusTone="error"
          />
        </div>
      );
  }
}

/** The kickoff states: book it, the booked call with the checklist, or a call nobody has confirmed. */
function KickoffTask({ view, panels, person, services, now, purchase }: HomeScreenProps) {
  const { state } = view;
  const canBook = person.role !== "viewer" && !person.isPhoneAccount;
  const cannotBookLine = canBook ? null : person.role === "viewer" ? VIEWER_MESSAGE : BOOK_PROBLEM_TEXT.no_email;
  const bookingUrl = panels.booking.ok ? panels.booking.data.bookingUrl : null;
  const meetingUrl = kickoffMeetingLink(view.kickoff?.inviteeUri, bookingUrl);
  const booked =
    state.kind === "kickoff_booked"
      ? {
          startsAtIso: state.startsAt?.toISOString() ?? null,
          endsAtIso: state.endsAt?.toISOString() ?? null,
          meetingUrl,
        }
      : null;
  const missedLine =
    state.kind === "kickoff_unbooked" && state.missedAt !== null
      ? `We missed each other on ${formatDateTime(state.missedAt, now)}. Pick a new time.`
      : state.kind === "kickoff_unconfirmed"
        ? websiteCopy(state, now).text
        : null;
  const firstOpen =
    panels.checklist?.ok === true
      ? (panels.checklist.data.items.find((item) => !item.done) ?? null)
      : null;
  const callStart = state.kind === "kickoff_booked" ? state.startsAt : null;

  return (
    <>
      <PurchasePush event={purchase} />
      <PageHeader
        title={
          state.kind === "kickoff_unconfirmed"
            ? websiteCopy(state, now).title
            : `Welcome, ${firstName(person.name)}. Your plan is active.`
        }
        description={homeLede(services, now)}
        {...(state.kind === "kickoff_booked" && firstOpen !== null && person.role !== "viewer"
          ? {
              actions: (
                <LinkButton href={firstOpen.href} variant="primary">
                  {firstOpen.label}
                </LinkButton>
              ),
            }
          : {})}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <KickoffPanel
            services={services}
            bookingUrl={bookingUrl}
            canBook={canBook}
            cannotBookLine={cannotBookLine}
            booked={booked}
            missedLine={missedLine}
          />
          {services.includes("social") ? (
            <ServiceCard
              serviceName="Social media"
              serviceIcon={<Icon name="MegaphoneSimple" size="md" />}
              statusLabel="Active"
              statusVariant="active"
              statusHasDot
              summary="Connect once and we write and post for you. About 5 minutes, no call needed."
            >
              <ul className="flex flex-col gap-2.5 p-0 list-none">
                <li className="flex items-center gap-3 rounded-control border border-border p-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-canvas text-ink">
                    <Icon name="InstagramLogo" size="sm" />
                  </span>
                  <span className="flex-1 font-sans text-sm font-semibold text-ink">Instagram</span>
                  <StatusChip label="Not connected" variant="idle" />
                  <LinkButton href="/social/accounts" size="sm">
                    Connect
                  </LinkButton>
                </li>
                <li className="flex items-center gap-3 rounded-control border border-border p-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-canvas text-ink">
                    <Icon name="FacebookLogo" size="sm" />
                  </span>
                  <span className="flex-1 font-sans text-sm font-semibold text-ink">Facebook Pages</span>
                  <StatusChip label="Not connected" variant="idle" />
                  <LinkButton href="/social/accounts" size="sm">
                    Connect
                  </LinkButton>
                </li>
                <li className="flex items-center gap-3 rounded-control border border-border p-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-canvas text-ink">
                    <Icon name="Storefront" size="sm" />
                  </span>
                  <span className="flex-1 font-sans text-sm font-semibold text-ink">Google Business</span>
                  <StatusChip label="Not connected" variant="idle" />
                  <LinkButton href="/social/accounts" size="sm">
                    Connect
                  </LinkButton>
                </li>
              </ul>
              <div className="mt-4 flex items-center gap-2.5 border-t border-border pt-4 text-sm text-ink-2">
                <b className="font-semibold text-ink">Status</b>
                <span className="h-2 w-2 rounded-full bg-accent-gold" aria-hidden="true" />
                <span className="font-sans text-sm">Waiting for your accounts</span>
              </div>
            </ServiceCard>
          ) : null}
          {services.includes("search") ? (
            <ServiceCard
              serviceName="Search"
              serviceIcon={<Icon name="MapPinArea" size="md" />}
              statusLabel="Waiting"
              statusVariant="waiting"
              summary="Local SEO and Google ranking presence starts right after your kickoff call."
              action={
                <Link
                  href="/search"
                  className="font-sans text-sm font-semibold text-ink underline decoration-accent-gold underline-offset-4"
                >
                  View search
                </Link>
              }
            />
          ) : null}
          {state.kind === "kickoff_booked" && panels.checklist !== null ? (
            <ChecklistPanel checklist={panels.checklist} canWrite={person.role !== "viewer"} />
          ) : state.kind === "kickoff_unbooked" ? (
            <HaveReadyPanel services={services} />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          <NeedsYouPanel items={panels.needs ?? { ok: true, data: [] }} primaryFirst={false}>
            <div className="flex items-center justify-between text-sm text-ink-2">
              <b className="font-semibold text-ink">Paid Ads</b>
              <StatusChip label="Coming soon" variant="idle" />
            </div>
          </NeedsYouPanel>
          <NextStepsPanel steps={kickoffSteps({ hasWebsite: services.includes("website"), callStart, held: false, now })} />
        </div>
      </div>
    </>
  );
}

/** Starting, preparing, building, on hold, approved, and the week after launch: the website path and what we did. */
function ProgressScreen({ view, panels, person, services, now }: HomeScreenProps) {
  const state = view.state as WebsiteState;
  const copy = websiteCopy(state, now);
  const kickoffAt = view.kickoff?.endsAt ?? null;
  const milestones =
    state.kind === "launched"
      ? null
      : websiteMilestones(state, {
          kickoffAt,
          firstPreviewDueAt: view.project?.slaDueAt ?? null,
          launchPlannedOn: view.project?.launchPlannedOn ?? null,
          now,
        });
  const firstNeed = panels.needs?.ok === true ? (panels.needs.data[0] ?? null) : null;
  const primary =
    state.kind === "launched" ? (
      <LinkButton href={`https://${state.hostname}`} target="_blank" rel="noopener noreferrer" variant="primary" icon="ArrowUpRight">
        Visit site
      </LinkButton>
    ) : undefined;

  return (
    <>
      <PageHeader
        title={`${greetingFor(now)}, ${firstName(person.name)}`}
        description={homeLede(services, now)}
        actions={
          <>
            <BookCallAction view={view} panels={panels} />
            {primary}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <NextActionCard
            serviceName="Website"
            serviceIcon={<Icon name="Browser" size="md" />}
            serviceBadge={state.kind === "on_hold" ? "On hold" : "Active"}
            title={copy.title}
            description={copy.text}
            primaryAction={{
              label: state.kind === "launched" ? "Visit site" : state.kind === "on_hold" ? "View requests" : "View website",
              href: state.kind === "launched" ? `https://${state.hostname}` : state.kind === "on_hold" ? "/requests" : "/website",
            }}
            statusText={
              state.kind === "launched"
                ? "Live"
                : state.kind === "on_hold"
                  ? "On hold"
                  : state.kind === "approved"
                    ? "Launching soon"
                    : "Building your website"
            }
            statusTone={state.kind === "launched" ? "active" : state.kind === "on_hold" ? "error" : "waiting"}
          />
          <WebsiteStatusPanel title="Progress" text={copy.text} milestones={milestones} />
          {panels.activity === null ? null : <ActivityPanel rows={panels.activity} now={now} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          {panels.needs === null ? null : (
            <NeedsYouPanel items={panels.needs} primaryFirst={state.kind === "on_hold" && firstNeed !== null}>
              <div className="flex items-center justify-between text-sm text-ink-2">
                <b className="font-semibold text-ink">Paid Ads</b>
                <StatusChip label="Coming soon" variant="idle" />
              </div>
            </NeedsYouPanel>
          )}
          {view.kickoff?.summary == null ? null : (
            <article className="rounded-panel border border-border bg-surface p-6 shadow-card">
              <Panel title="From your kickoff">
                <p className="font-sans text-sm text-ink">{view.kickoff.summary}</p>
                <p className="mt-2 font-sans text-xs text-ink-3">Written by your team after the call.</p>
              </Panel>
            </article>
          )}
          {panels.coming === null ? null : <ComingUpPanel coming={panels.coming} now={now} />}
          {panels.included === null ? null : <IncludedEditsPanel included={panels.included} now={now} />}
        </div>
      </div>
    </>
  );
}

/** The preview is ready, or changes are being made. */
function ReviewScreen({ view, panels, now }: HomeScreenProps) {
  const state = view.state as WebsiteState;
  const copy = websiteCopy(state, now);
  const kickoffAt = view.kickoff?.endsAt ?? null;
  const lead: readonly NeedsYouItem[] =
    state.kind === "preview_ready"
      ? [
          {
            key: "preview",
            label: "Check your website preview",
            hint: "Approve it or ask for changes",
            service: "website",
            href: "/website",
            action: "Review",
          },
        ]
      : [];

  return (
    <>
      <PageHeader
        title={copy.title}
        {...(kickoffAt === null ? {} : { description: `We built it after your kickoff call on ${formatDate(kickoffAt, now)}.` })}
        actions={<BookCallAction view={view} panels={panels} />}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <NextActionCard
            serviceName="Website"
            serviceIcon={<Icon name="Browser" size="md" />}
            serviceBadge="Active"
            title={copy.title}
            description={copy.text}
            primaryAction={{ label: "Open preview", href: "/website" }}
            statusText="Waiting for your review"
            statusTone="waiting"
          />
          <WebsiteStatusPanel
            title="Progress"
            text={copy.text}
            milestones={websiteMilestones(state, {
              kickoffAt,
              firstPreviewDueAt: null,
              launchPlannedOn: view.project?.launchPlannedOn ?? null,
              now,
            })}
          />
          {panels.activity === null ? null : <ActivityPanel rows={panels.activity} now={now} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          {panels.needs === null ? null : (
            <NeedsYouPanel items={panels.needs} primaryFirst={false} lead={lead}>
              <div className="flex items-center justify-between text-sm text-ink-2">
                <b className="font-semibold text-ink">Paid Ads</b>
                <StatusChip label="Coming soon" variant="idle" />
              </div>
            </NeedsYouPanel>
          )}
          <RoundsPanel project={view.project} />
        </div>
      </div>
    </>
  );
}

/** A month in: what needs the customer, the last 30 days, the services, and what we did. */
function OverviewScreen({ view, panels, person, now }: HomeScreenProps) {
  const needs = panels.needs;
  const count = needs?.ok === true ? needs.data.length : null;
  const description = needs?.ok === true ? overviewLede(needs.data) : undefined;

  return (
    <>
      <PageHeader
        title={`${greetingFor(now)}, ${firstName(person.name)}`}
        {...(description === undefined ? {} : { description })}
        actions={
          <>
            <BookCallAction view={view} panels={panels} />
            {person.role === "viewer" ? null : (
              <LinkButton href={NEW_REQUEST} variant={count !== null && count > 0 ? "secondary" : "primary"} icon="Plus">
                New request
              </LinkButton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          {panels.services === null ? null : <ServicesPanel lines={panels.services} />}
          {panels.enquiries === null && panels.figures === null && panels.visits === null ? null : (
            <LastThirtyDays
              series={panels.enquiries}
              figures={panels.figures}
              visits={panels.visits}
              search={panels.search}
            />
          )}
          {panels.enquiries === null ? null : <EnquiriesChart series={panels.enquiries} />}
          {panels.activity === null ? null : <ActivityPanel rows={panels.activity} now={now} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          {person.role === "viewer" || needs === null ? null : (
            <NeedsYouPanel items={needs} primaryFirst={count !== null && count > 0}>
              <div className="flex items-center justify-between text-sm text-ink-2">
                <b className="font-semibold text-ink">Paid Ads</b>
                <StatusChip label="Coming soon" variant="idle" />
              </div>
            </NeedsYouPanel>
          )}
          {panels.coming === null ? null : <ComingUpPanel coming={panels.coming} now={now} />}
          {panels.included === null ? null : <IncludedEditsPanel included={panels.included} now={now} />}
        </div>
      </div>
    </>
  );
}

/** Home: one of four templates, chosen by the state. Exactly one primary action per state. */
export function HomeScreen(props: HomeScreenProps) {
  const { view } = props;
  switch (view.layout) {
    case "task":
      return view.state.kind === "payment_required" ||
        view.state.kind === "payment_processing" ||
        view.state.kind === "lapsed" ? (
        <PaymentTask {...props} />
      ) : (
        <KickoffTask {...props} />
      );
    case "progress":
      return <ProgressScreen {...props} />;
    case "review":
      return <ReviewScreen {...props} />;
    case "overview":
      return <OverviewScreen {...props} />;
  }
}
