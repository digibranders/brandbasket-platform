import type { ReactNode } from "react";
import { LineChart, MetricStrip, Panel, PanelData, StatusBadge, Stepper, TimelineSteps, type Metric } from "@/components";
import type { ChecklistSummary } from "@/features/checklist/loader";
import { AD_LEADS_NOTE } from "@/features/social/rules";
import { changeAgainst } from "@/features/enquiries/rules";
import { visitsMetric } from "@/features/website/components/visits-panels";
import type { VisitsData } from "@/features/website/loader";
import type { Loaded } from "@/lib/loaded";
import { formatDate, formatDateTime, formatNumber, formatOutOf, formatRelative, formatTime } from "@/lib/format";
import { Badge, Icon, LinkButton, Meter, SERVICE_NAMES, ServiceTag, type IconName } from "@/ui";
import type { ComingUp, HomeStateView, IncludedEdits, ServiceLine, StripFigures } from "../loader";
import { roundsIncludedLine, type ActivityRow, type EnquirySeries, type Milestone, type NeedsYouItem, type NextStepRow } from "../rules";

/*
 * Home's panels, each drawn from its own Loaded<T> (mock: screens-a.js, Home). A failed panel shows its own error and the
 * rest of Home still draws.
 */

const ROW = "flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0";

function iconOf(item: NeedsYouItem): IconName {
  if (item.key === "posts") return "ThumbsUp";
  if (item.key === "billing") return "CreditCard";
  if (item.key.startsWith("setup-")) return "UploadSimple";
  if (item.action === "Pay") return "CreditCard";
  if (item.action === "Reply") return "ChatText";
  return item.label.startsWith("Check") ? "Eye" : "Receipt";
}

/** Needs you: everything waiting on the customer. The first row's button is the page's primary action when `primaryFirst`. */
export function NeedsYouPanel({ items, primaryFirst, lead = [] }: { readonly items: Loaded<readonly NeedsYouItem[]>; readonly primaryFirst: boolean; readonly lead?: readonly NeedsYouItem[] }) {
  return (
    <PanelData
      title="Needs you"
      data={items}
      what="what needs you"
      flush
      isEmpty={(rows) => lead.length + rows.length === 0}
      empty={{ icon: "CheckCircle", title: "Nothing needed from you right now", description: "Anything we need from you shows here first." }}
    >
      {(rows) => (
        <ul className="m-0 list-none p-0">
          {[...lead, ...rows].map((item, index) => (
            <li key={item.key} className={ROW}>
              <Icon name={iconOf(item)} className="text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="type-sub text-ink">{item.label}</p>
                <p className="flex flex-wrap items-center gap-2 type-meta">
                  {item.service === null ? null : <ServiceTag service={item.service} />}
                  {item.hint}
                </p>
              </div>
              <LinkButton href={item.href} size="sm" variant={primaryFirst && index === 0 ? "primary" : "secondary"}>
                {item.action}
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </PanelData>
  );
}

/**
 * The last 30 days strip: the figures with a customer read path. Enquiries from the enquiries list; Leads from ads and Google
 * page one from the month's numbers staff enter. Each is left out when it is not known, and a change is left out when there is
 * nothing to compare. Website visits come from the roll-ups or Google Analytics and are drawn only once a day has been counted.
 */
export function LastThirtyDays({
  series,
  figures,
  visits,
}: {
  readonly series: Loaded<EnquirySeries> | null;
  readonly figures: Loaded<StripFigures> | null;
  readonly visits: Loaded<VisitsData | null> | null;
}) {
  const metrics: Metric[] = [...visitsMetric(visits)];
  if (series?.ok === true) {
    const change = changeAgainst(series.data.currentTotal, series.data.previousTotal);
    metrics.push({ label: "Enquiries", value: formatNumber(series.data.currentTotal), ...(change === null ? {} : { change: { value: change } }) });
  }
  if (figures?.ok === true) {
    const { adLeads, pageOne, month } = figures.data;
    if (adLeads !== null) metrics.push({ label: "Leads from ads", value: formatNumber(adLeads.count), period: AD_LEADS_NOTE, ...(adLeads.updatedAt === null ? {} : { asOf: adLeads.updatedAt }) });
    if (pageOne !== null) {
      const diff = pageOne.diff === 0 ? null : pageOne.diff;
      metrics.push({ label: "Google page one", value: formatNumber(pageOne.count), ...(diff === null ? {} : { change: { value: diff } }), period: `Tracked searches, ${month}`, asOf: pageOne.checkedAt });
    }
  }
  const failed = [series, figures, visits].filter((panel) => panel !== null && !panel.ok);
  if (metrics.length === 0 && failed.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="type-sub text-ink">
        Last 30 days <span className="type-meta">vs the 30 days before</span>
      </h2>
      <MetricStrip label="Last 30 days" metrics={metrics} />
      {series !== null && !series.ok ? (
        <PanelData data={series} what="your enquiries">
          {() => null}
        </PanelData>
      ) : null}
      {visits !== null && !visits.ok ? (
        <PanelData data={visits} what="your visits">
          {() => null}
        </PanelData>
      ) : null}
      {figures !== null && !figures.ok ? (
        <PanelData data={figures} what="your ad and search figures">
          {() => null}
        </PanelData>
      ) : null}
    </section>
  );
}

/** Enquiries by day, this 30 days against the 30 before. */
export function EnquiriesChart({ series }: { readonly series: Loaded<EnquirySeries> }) {
  return (
    <PanelData title="Enquiries by day" data={series} what="your enquiries" action={<LinkButton href="/enquiries" variant="ghost" size="sm">All enquiries</LinkButton>}>
      {(data) => (
        <LineChart
          label="Enquiries per day for the last 30 days"
          labels={data.labels}
          current={{ name: "This 30 days", values: data.current }}
          previous={{ name: "Previous 30 days", values: data.previous }}
          height={200}
        />
      )}
    </PanelData>
  );
}

const SERVICE_HREF = { website: "/website", social: "/social", search: "/search" } as const;

/** Your services: each bought service, what is measured this month, and whether it needs the customer. */
export function ServicesPanel({ lines }: { readonly lines: Loaded<readonly ServiceLine[]> }) {
  return (
    <PanelData title="Your services" data={lines} what="your services" flush isEmpty={(rows) => rows.length === 0} empty={{ icon: "Storefront", title: "No services yet", description: "The services on your plan show here." }}>
      {(rows) => (
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <li key={row.service} className={ROW}>
              <div className="min-w-0 flex-1">
                <p className="type-sub text-ink">
                  <ServiceTag service={row.service} />
                </p>
                {row.line === null ? null : <p className="type-meta">{row.line}</p>}
              </div>
              {row.needsYou ? <Badge tone="warn">Needs you</Badge> : <StatusBadge kind="service" status="active" />}
              <LinkButton href={SERVICE_HREF[row.service]} variant="ghost" size="sm" aria-label={`Open ${SERVICE_NAMES[row.service]}`}>
                <Icon name="CaretRight" size="sm" />
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </PanelData>
  );
}

/** What we did: the latest work, newest first. */
export function ActivityPanel({ rows, now }: { readonly rows: Loaded<readonly ActivityRow[]>; readonly now: Date }) {
  return (
    <PanelData title="What we did" data={rows} what="what we did" isEmpty={(list) => list.length === 0} empty={{ icon: "ListChecks", title: "Nothing to show yet", description: "Each piece of work we do for you shows here." }}>
      {(list) => (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {list.map((row) => (
            <li key={row.key} className="flex gap-3">
              <Icon name="CheckCircle" className="text-ink-3" />
              <div className="min-w-0">
                <p className="type-sub text-ink">{row.label}</p>
                <p className="type-meta">
                  {formatRelative(row.at, now)}
                  {row.service === null ? null : `. ${SERVICE_NAMES[row.service]}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PanelData>
  );
}

/** Coming up: the next call, the posts going out this week, the next payment. */
export function ComingUpPanel({ coming, now }: { readonly coming: Loaded<ComingUp>; readonly now: Date }) {
  const rows = (data: ComingUp): readonly { readonly key: string; readonly icon: IconName; readonly title: string; readonly line: string }[] => [
    ...(data.call === null
      ? []
      : [
          {
            key: "call",
            icon: "VideoCamera" as const,
            title: data.call.about === "Kickoff" ? "Kickoff call" : `${data.call.about} call`,
            line: `${formatDateTime(new Date(data.call.startsAtIso), now)} to ${formatTime(new Date(data.call.endsAtIso))}. Video`,
          },
        ]),
    ...(data.postsThisWeek === 0 ? [] : [{ key: "posts", icon: "CalendarBlank" as const, title: data.postsThisWeek === 1 ? "1 post scheduled" : `${formatNumber(data.postsThisWeek)} posts scheduled`, line: "This week" }]),
    ...(data.payment === null ? [] : [{ key: "payment", icon: "CreditCard" as const, title: `Next payment ${data.payment.amount ?? "to be confirmed"}`, line: formatDate(data.payment.date, now) }]),
  ];
  return (
    <PanelData title="Coming up" data={coming} what="what is coming up" flush isEmpty={(data) => rows(data).length === 0} empty={{ icon: "CalendarBlank", title: "Nothing booked yet", description: "Calls, posts and payments show here before they happen." }}>
      {(data) => (
        <ul className="m-0 list-none p-0">
          {rows(data).map((row) => (
            <li key={row.key} className={ROW}>
              <Icon name={row.icon} className="text-ink-3" />
              <div className="min-w-0">
                <p className="type-sub text-ink">{row.title}</p>
                <p className="type-meta">{row.line}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelData>
  );
}

/** Small edits used this month. Not drawn for a plan without the website, which has none. */
export function IncludedEditsPanel({ included, now }: { readonly included: Loaded<IncludedEdits | null>; readonly now: Date }) {
  if (included.ok && included.data === null) return null;
  return (
    <PanelData title="Small edits included this month" data={included} what="your small edits">
      {(data) =>
        data === null ? null : (
          <div className="flex flex-col gap-2.5">
            <Meter label="Used this month" value={Math.min(data.used, data.allowed)} max={data.allowed} valueText={formatOutOf(data.used, data.allowed)} />
            <p className="type-meta">Resets {formatDate(data.resetsAt, now)}. Small website changes are included. Bigger ones get a price first, and you decide.</p>
          </div>
        )
      }
    </PanelData>
  );
}

/** The rounds of changes left on the preview (Review layout). */
export function RoundsPanel({ project }: { readonly project: HomeStateView["project"] }) {
  if (project === null) return null;
  const { revisionRoundsIncluded: included, revisionRoundsGranted: granted } = project;
  return (
    <Panel title="Changes included">
      <Meter label={roundsIncludedLine(included, granted)} value={Math.min(granted, included)} max={Math.max(included, 1)} valueText={`${formatOutOf(Math.min(granted, included), included)} used`} />
    </Panel>
  );
}

/** The website's path as a Stepper, or the status alone once it is live. */
export function WebsiteStatusPanel({ title, text, milestones, action }: { readonly title: string; readonly text: string; readonly milestones: readonly Milestone[] | null; readonly action?: ReactNode }) {
  return (
    <Panel title={title}>
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink-2">{text}</p>
        {milestones === null ? null : <Stepper label="Website progress" steps={milestones.map((step) => ({ label: step.label, state: step.state, ...(step.note === null ? {} : { date: step.note }) }))} />}
        {action === undefined ? null : <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
    </Panel>
  );
}

/** What happens next, top to bottom, around the kickoff. */
export function NextStepsPanel({ steps }: { readonly steps: readonly NextStepRow[] }) {
  return (
    <Panel title="What happens next">
      <TimelineSteps label="What happens next" steps={steps.map((step) => ({ title: step.title, meta: step.meta, state: step.state }))} />
    </Panel>
  );
}

const HAVE_READY: readonly { readonly service: "website" | "social" | "search"; readonly items: readonly string[] }[] = [
  { service: "website", items: ["Logo", "5 to 10 photos of your place, team and work", "Services and prices", "Domain login, if you own one"] },
  { service: "social", items: ["Instagram and Facebook access", "Offers to promote", "Monthly ad budget"] },
  { service: "search", items: ["Areas you serve", "Main competitors", "Google profile access"] },
];

/** Before the call is booked: what to have ready, per bought service. */
export function HaveReadyPanel({ services }: { readonly services: readonly ("website" | "social" | "search")[] }) {
  const groups = HAVE_READY.filter((group) => services.includes(group.service));
  if (groups.length === 0) return null;
  return (
    <Panel title="Have these ready">
      <p className="mb-3 type-body text-ink-2">Bring what you have. We fill in the rest on the call.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.service} className="rounded-control bg-surface-subtle p-3">
            <ServiceTag service={group.service} />
            <ul className="mt-2 mb-0 pl-4 type-body text-ink-2">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Once the call is booked: the setup checklist, saved item by item on /checklist. */
export function ChecklistPanel({ checklist, canWrite }: { readonly checklist: Loaded<ChecklistSummary>; readonly canWrite: boolean }) {
  return (
    <PanelData title="Get ready for your call" data={checklist} what="your checklist" isEmpty={(data) => data.total === 0} empty={{ icon: "CheckCircle", title: "Nothing to get ready", description: "Bring your questions to the call." }}>
      {(data) => (
        <div className="flex flex-col gap-3">
          <Meter label="Done" value={data.done} max={data.total} valueText={formatOutOf(data.done, data.total)} />
          <p className="type-meta">Add what you can now. Bring the rest to the call. Everything saves as you go.</p>
          <ul className="-mx-4 -mb-4 list-none p-0">
            {data.items.map((item) => (
              <li key={item.key} className={ROW}>
                <Icon name={item.done ? "Check" : "Circle"} className={item.done ? "text-pos-text" : "text-ink-3"} />
                <div className="min-w-0 flex-1">
                  <p className={item.done ? "type-body text-ink-3" : "type-sub text-ink"}>{item.label}</p>
                  <ServiceTag service={item.service} />
                </div>
                {item.done ? (
                  <Badge tone="pos">Done</Badge>
                ) : canWrite ? (
                  <LinkButton href={item.href} size="sm">
                    Add
                  </LinkButton>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelData>
  );
}
