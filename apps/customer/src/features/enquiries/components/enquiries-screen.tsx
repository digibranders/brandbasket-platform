import { FilterBar, MetricStrip, PageHeader, Panel, PanelError, type Metric } from "@/components";
import { formatNumber, formatOutOf, formatQuantity } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { LinkButton, TabLinks, Icon, type ChipOption } from "@/ui";
import { buttonClasses } from "@/ui/button-styles";
import { loadChatAssistant, loadEnquiries, type EnquiriesView } from "../loader";
import {
  CHAT_TAB_PATH,
  ENQUIRIES_PATH,
  EXPORT_PATH,
  filterRows,
  oldestLine,
  readFilters,
  SOURCE_GROUP_LABELS,
  SOURCE_PHRASES,
  sourcesPresent,
  statusCounts,
  type Filters,
} from "../rules";
import { ChatAssistant } from "./chat-assistant";
import { EnquiriesTable } from "./enquiries-table";

export interface EnquiriesParams {
  readonly tab?: string | string[];
  readonly status?: string | string[];
  readonly source?: string | string[];
}

const STATUS_LABELS = { all: "All", new: "New", contacted: "Contacted", won: "Won", lost: "Lost" } as const;

function metricsOf(view: EnquiriesView): Metric[] {
  const { summary } = view;
  const metrics: Metric[] = [
    { label: "New, not replied", value: formatNumber(summary.waiting), ...(summary.oldestWaiting === null ? {} : { period: oldestLine(summary.oldestWaiting, view.now) }) },
    {
      label: "Received",
      value: formatNumber(summary.received),
      period: "Last 30 days",
      ...(summary.receivedChange === null ? {} : { change: { value: summary.receivedChange } }),
    },
    { label: "Won", value: formatNumber(summary.won), period: "You marked these as customers" },
  ];
  if (summary.bestSource !== null) {
    metrics.push({
      label: "Best source",
      value: SOURCE_GROUP_LABELS[summary.bestSource.group],
      period: `${formatOutOf(summary.bestSource.count, summary.received)} came from ${SOURCE_PHRASES[summary.bestSource.group]}`,
    });
  }
  return metrics;
}

/** What the website's taps add up to, and the Google calls inside the total (ported contact figures; Google does not share callers). */
function footnote(view: EnquiriesView): string | undefined {
  const { contacts, googleCalls } = view.summary;
  const parts: string[] = [];
  if (contacts !== null) {
    parts.push(
      `Counted from your website in the last 30 days: ${formatQuantity(contacts.call, "call")}, ${formatQuantity(contacts.whatsapp, "WhatsApp tap")}, ${formatQuantity(contacts.form, "form")}.`,
    );
  }
  if (googleCalls > 0) parts.push(`${formatQuantity(googleCalls, "call")} from your Google profile ${googleCalls === 1 ? "is" : "are"} in the total: Google does not share who called.`);
  if (view.truncated) parts.push("Only the latest enquiries are shown. Export has them all.");
  return parts.length === 0 ? undefined : parts.join(" ");
}

function List({ view, filters, customer }: { readonly view: EnquiriesView; readonly filters: Filters; readonly customer: CustomerContext }) {
  const { rows, now } = view;
  const canEdit = customer.role !== "viewer" && customer.billing.status === "paid";
  if (rows.length === 0) {
    return (
      <Panel flush>
        <EnquiriesTable
          rows={[]}
          canEdit={false}
          now={now}
          empty={{ icon: "Tray", title: "No enquiries yet", description: "When someone calls, chats, fills a form or answers an ad, they appear here." }}
        />
      </Panel>
    );
  }
  const shown = filterRows(rows, filters);
  const counts = statusCounts(rows, filters.source);
  const groups = sourcesPresent(rows);
  const statusOptions: ChipOption[] = (["all", "new", "contacted", "won", "lost"] as const).map((value) => ({ value, label: STATUS_LABELS[value], count: formatNumber(counts[value]) }));
  const sourceOptions: ChipOption[] = [
    { value: "all", label: "All sources" },
    { value: "website", label: "Website" },
    { value: "ads", label: "Ads" },
    ...(groups.has("google") ? [{ value: "google", label: "Google" }] : []),
  ];
  const note = footnote(view);
  return (
    <>
      <MetricStrip label="Enquiries at a glance" metrics={metricsOf(view)} />
      <Panel flush>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-3">
          <FilterBar label="Status" param="status" defaultValue="all" options={statusOptions} />
          <FilterBar label="Source" param="source" defaultValue="all" options={sourceOptions} />
        </div>
        <EnquiriesTable
          rows={shown}
          canEdit={canEdit}
          now={now}
          empty={{
            icon: "Tray",
            title: "No enquiries match",
            description: "Try another status or source.",
            action: <LinkButton href={ENQUIRIES_PATH}>Clear filters</LinkButton>,
          }}
          footer={note === undefined ? undefined : <span className="type-meta">{note}</span>}
        />
      </Panel>
    </>
  );
}

/** The Enquiries page: the list with its figures, and the chat assistant tab for customers with the Managed Website. */
export async function EnquiriesScreen({ customer, params }: { readonly customer: CustomerContext; readonly params: EnquiriesParams }) {
  const showChat = customer.services.includes("website");
  const chat = showChat && params.tab === "chat";
  const filters = readFilters(params);

  const content = chat ? (
    <ChatAssistant data={await load("enquiries.chat", () => loadChatAssistant(customer))} canEdit={customer.role !== "viewer" && customer.billing.status === "paid"} />
  ) : (
    await listContent(customer, filters)
  );

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Everyone who called, chatted, filled a form or answered an ad. Last 30 days, and anyone still waiting for a reply."
        {...(chat
          ? {}
          : {
              actions: (
                <a href={EXPORT_PATH} download className={buttonClasses("secondary", "md")}>
                  <Icon name="DownloadSimple" size="sm" />
                  Export
                </a>
              ),
            })}
        {...(showChat
          ? {
              tabs: (
                <TabLinks
                  aria-label="Enquiries sections"
                  current={chat ? CHAT_TAB_PATH : ENQUIRIES_PATH}
                  items={[
                    { href: ENQUIRIES_PATH, label: "Enquiries" },
                    { href: CHAT_TAB_PATH, label: "Chat assistant" },
                  ]}
                />
              ),
            }
          : {})}
      />
      <div className="flex flex-col gap-4">{content}</div>
    </>
  );
}

async function listContent(customer: CustomerContext, filters: Filters) {
  const loaded = await load("enquiries.list", () => loadEnquiries(customer));
  if (!loaded.ok) {
    return (
      <Panel title="Enquiries">
        <PanelError failure={loaded.error} what="your enquiries" />
      </Panel>
    );
  }
  return <List view={loaded.data} filters={filters} customer={customer} />;
}
