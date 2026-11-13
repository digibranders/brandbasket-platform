"use client";

import { useState, type ReactNode } from "react";
import {
  BarList,
  DataTable,
  DataTableLoading,
  Delta,
  FilterBar,
  LineChart,
  MetricStrip,
  MetricStripLoading,
  NextStep,
  PageHeader,
  Panel,
  PanelData,
  PanelEmpty,
  PanelError,
  PanelLoading,
  RefreshButton,
  SaveBar,
  ServiceMark,
  Sparkline,
  StatusBadge,
  Stepper,
  TimelineSteps,
} from "@/components";
import { Button, LinkButton, TabLinks } from "@/ui";

// Sample content for the preview only. None of it is shown to customers.
interface SampleEnquiry {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly status: "new" | "contacted" | "won";
  readonly received: string;
}
const ENQUIRIES: readonly SampleEnquiry[] = [
  { id: "e1", name: "Rohan Mehta", source: "Website chat", status: "new", received: "Today, 10:42" },
  { id: "e2", name: "Priya Nair", source: "Form", status: "contacted", received: "Yesterday, 17:30" },
  { id: "e3", name: "Imran Shaikh", source: "Call", status: "won", received: "Sun 1 Nov" },
];
const DAYS = ["1 Nov", "2 Nov", "3 Nov", "4 Nov", "5 Nov", "6 Nov", "7 Nov", "8 Nov", "9 Nov", "10 Nov", "11 Nov", "12 Nov"];
const FAILED_AT = new Date("2026-11-24T06:12:00Z");

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-section">{title}</h2>
      {children}
    </section>
  );
}

/** Every application component in src/components, in its states (plan 60, section 16). Development only. */
export function ComponentsShowcase() {
  const [dirty, setDirty] = useState(false);
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="type-title">Application components</p>
        <p className="type-meta">Every component in src/components, with sample data.</p>
      </header>

      <Group title="PageHeader">
        <div className="rounded-panel border border-border bg-surface p-4">
          <PageHeader
            title="Website"
            description="Live since Tue 3 Nov"
            back={{ href: "/design-system", label: "Back" }}
            actions={<Button variant="primary" icon="Plus">Ask for a change</Button>}
            tabs={<TabLinks aria-label="Website" current="/design-system" items={[{ href: "/design-system", label: "Overview" }, { href: "/design-system?tab=pages", label: "Pages" }]} />}
          />
        </div>
      </Group>

      <Group title="MetricStrip, Delta">
        <MetricStrip
          label="Last 30 days"
          metrics={[
            { label: "Enquiries", value: "38", change: { value: 9, significant: true }, period: "Last 30 days" },
            { label: "Visits", value: "1,204", change: { value: 12, unit: "percent" } },
            { label: "Searches on page one", value: "9", unit: "of 12", change: { value: 3, unit: "rank", significant: true } },
            { label: "Rating", value: "4.6", asOf: new Date("2026-11-23T06:00:00Z") },
          ]}
        />
        <MetricStripLoading />
        <div className="flex gap-4">
          <Delta value={-4} significant />
          <Delta value={-4} better="down" significant />
          <Delta value={0} />
        </div>
      </Group>

      <Group title="Panel, PanelData, PanelEmpty, PanelError, PanelLoading, RefreshButton">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Coming up" meta="This week" action={<LinkButton href="/design-system" size="sm" variant="ghost">See all</LinkButton>}>
            <p className="type-body">A padded panel body.</p>
          </Panel>
          <PanelData
            title="What we did"
            data={{ ok: true, data: ["Fixed your address on 4 listings"] }}
            asOf={() => new Date("2026-11-23T06:00:00Z")}
          >
            {(lines) => <p className="type-body">{lines[0]}</p>}
          </PanelData>
          <Panel title="Enquiries by day">
            <PanelEmpty icon="Tray" title="No enquiries yet" description="When someone calls, chats or fills a form, they show up here." />
          </Panel>
          <Panel title="Top pages">
            <PanelError failure={{ at: FAILED_AT }} what="your top pages" />
          </Panel>
          <PanelLoading title="Requests" rows={3} />
          <Panel title="Try again on its own">
            <RefreshButton />
          </Panel>
        </div>
      </Group>

      <Group title="FilterBar, DataTable, DataTableLoading, StatusBadge">
        <FilterBar
          label="Status"
          defaultValue="all"
          options={[
            { value: "all", label: "All", count: "3" },
            { value: "new", label: "New", count: "1" },
            { value: "won", label: "Won", count: "1" },
          ]}
          search={{ label: "Search enquiries" }}
          shallow
        />
        <Panel flush>
          <DataTable
            label="Enquiries"
            rows={ENQUIRIES}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Name", cell: (row) => row.name, sortValue: (row) => row.name },
              { key: "source", header: "Source", cell: (row) => row.source, priority: "low" },
              { key: "status", header: "Status", cell: (row) => <StatusBadge kind="enquiry" status={row.status} /> },
              { key: "received", header: "Received", cell: (row) => row.received, align: "end" },
            ]}
            inspect={(row) => ({ title: row.name, description: row.source, body: <p className="type-body">The enquiry opens here.</p>, footer: <Button variant="primary">Call</Button> })}
            empty={{ icon: "Tray", title: "No enquiries yet", description: "They show up here." }}
            count={(rows) => `${rows} enquiries`}
          />
        </Panel>
        <Panel flush>
          <DataTableLoading columns={4} rows={3} />
        </Panel>
        <div className="flex flex-wrap gap-2">
          <StatusBadge kind="request" status="sent" />
          <StatusBadge kind="request" status="quoted" />
          <StatusBadge kind="request" status="ready_to_check" />
          <StatusBadge kind="request" status="waiting_for_you" />
          <StatusBadge kind="post" status="needs_approval" />
          <StatusBadge kind="website" status="live" />
          <StatusBadge kind="service" status="ending" endsOn={new Date("2026-12-01T06:00:00Z")} />
          <StatusBadge kind="invoice" status="failed" />
        </div>
      </Group>

      <Group title="NextStep, Stepper, TimelineSteps">
        <NextStep icon="Receipt" actions={<Button variant="primary">Accept and pay</Button>} note="₹1,500 includes 18% GST">
          A new page is more than a small edit, so it needs your OK first. Accept today and it is ready to check by Thu 3 Dec.
        </NextStep>
        <Panel title="Progress">
          <Stepper
            label="Request progress"
            steps={[
              { label: "Sent", date: "Mon 2 Nov", state: "done" },
              { label: "Quoted", date: "Tue 3 Nov", state: "done" },
              { label: "In progress", state: "now" },
              { label: "Ready to check", state: "todo" },
              { label: "Done", state: "todo" },
            ]}
          />
        </Panel>
        <Panel title="What happens next">
          <TimelineSteps
            label="What happens next"
            steps={[
              { title: "Kickoff call", meta: "Tue 3 Nov", state: "done" },
              { title: "We build it", meta: "By Fri 6 Nov", state: "now" },
              { title: "You check it", meta: "By Mon 9 Nov", state: "todo" },
            ]}
          />
        </Panel>
      </Group>

      <Group title="LineChart, Sparkline, BarList, ServiceMark">
        <Panel title="Visits">
          <LineChart
            label="Visits by day, 1 to 12 Nov"
            labels={DAYS}
            current={{ name: "This month", values: [32, 41, 38, 52, 47, 61, 58, 66, 70, 64, 79, 84] }}
            previous={{ name: "Last month", values: [28, 30, 35, 33, 40, 38, 45, 44, 50, 48, 52, 55] }}
          />
        </Panel>
        <Panel title="Position for “blood test near me”">
          <LineChart label="Search position by week" labels={["Week 1", "Week 2", "Week 3", "Week 4"]} current={{ name: "Position", values: [14, 9, 6, 4] }} invert />
        </Panel>
        <div className="flex items-center gap-4">
          <Sparkline values={[3, 5, 4, 8, 7, 9, 12]} label="Enquiries rising" />
          <ServiceMark service="website" />
          <ServiceMark service="social" />
          <ServiceMark service="search" bought={false} />
        </div>
        <Panel title="Visits by source">
          <BarList
            label="Visits by source, last 30 days"
            items={[
              { label: "Google search", value: 612 },
              { label: "Google Maps", value: 301 },
              { label: "Direct", value: 188 },
            ]}
          />
        </Panel>
      </Group>

      <Group title="SaveBar">
        <form id="sample-form" onSubmit={(event) => event.preventDefault()} className="flex gap-2">
          <Button onClick={() => setDirty(true)}>Make an edit</Button>
        </form>
        <SaveBar dirty={dirty} formId="sample-form" onDiscard={() => setDirty(false)} />
      </Group>
    </div>
  );
}
