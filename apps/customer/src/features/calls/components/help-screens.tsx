import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { businessDetails } from "@brandbasket/shared/lib/site-config";
import type { ReactNode } from "react";
import { PageHeader, Panel, PanelData } from "@/components";
import type { Loaded } from "@/lib/loaded";
import { formatDate, formatTime } from "@/lib/format";
import { Button, Icon, LinkButton, TabLinks, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { buttonClasses } from "@/ui/button-styles";
import type { BookOptions, CallsView } from "../loader";
import type { CallRow } from "../rules";
import { BookCallDialog } from "./book-call-dialog";
import { CancelCallButton } from "./cancel-call-button";

const TABS = [
  { href: "/help", label: "Calls" },
  { href: "/help/contact", label: "Contact us" },
] as const;

/** "Book a call" as a dialog, when calls are open and this member can book. */
export function BookCallButton({ book, variant = "primary" }: { readonly book: BookOptions | null; readonly variant?: "primary" | "secondary" }) {
  if (book === null || !book.canBook) return null;
  return (
    <BookCallDialog
      options={book.options}
      bookingUrl={book.bookingUrl}
      trigger={
        <Button variant={variant} icon="CalendarBlank">
          Book a call
        </Button>
      }
    />
  );
}

function HelpHeader({ current, actions }: { readonly current: string; readonly actions?: ReactNode }) {
  return (
    <PageHeader
      title="Help & calls"
      description="Talk to us about anything. We reply within one working day."
      {...(actions === undefined ? {} : { actions })}
      tabs={<TabLinks aria-label="Help" items={TABS} current={current} />}
    />
  );
}

function UpcomingRow({ row, book }: { readonly row: CallRow; readonly book: BookOptions | null }) {
  const starts = new Date(row.startsAtIso);
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
      <Icon name="VideoCamera" className="text-accent-text" />
      <div className="min-w-0 flex-1">
        <p className="type-sub text-ink">{row.about === "Kickoff" ? "Kickoff call" : `${row.about} call`}</p>
        <p className="type-meta">
          {formatDate(starts)}, {formatTime(starts)} to {formatTime(new Date(row.endsAtIso))}. Video
        </p>
      </div>
      <a className={buttonClasses("secondary", "sm")} href={callInviteHref(row.startsAtIso, row.endsAtIso, row.key === "kickoff" ? "Brandbasket kickoff call" : "Brandbasket call")} download="brandbasket-call.ics">
        Add to calendar
      </a>
      {row.canChange && row.callId !== null && book !== null && book.canBook ? (
        <BookCallDialog
          options={book.options}
          bookingUrl={book.bookingUrl}
          replacing={{ callId: row.callId, reason: row.reason, note: row.note }}
          trigger={<Button size="sm">Change</Button>}
        />
      ) : null}
      {row.canCancel && row.callId !== null && book !== null && book.canBook ? <CancelCallButton callId={row.callId} when={row.when} /> : null}
    </li>
  );
}

/** Help & calls, Calls tab (mock: screens-c.js, help): the upcoming call, and past calls with what was agreed. */
export function HelpCallsScreen({ calls }: { readonly calls: Loaded<CallsView> }) {
  return (
    <>
      <HelpHeader current="/help" actions={calls.ok ? <BookCallButton book={calls.data.book} /> : undefined} />
      <div className="flex flex-col gap-4">
        <PanelData
          title="Upcoming"
          data={calls}
          what="your calls"
          flush
          isEmpty={(view) => view.upcoming.length === 0}
          empty={{ icon: "CalendarBlank", title: "No calls booked", description: "Book a call when you want to talk something through." }}
        >
          {(view) => (
            <ul className="m-0 list-none p-0">
              {view.upcoming.map((row) => (
                <UpcomingRow key={row.key} row={row} book={view.book} />
              ))}
            </ul>
          )}
        </PanelData>
        <PanelData
          title="Past calls"
          data={calls}
          what="your calls"
          flush
          isEmpty={(view) => view.past.length === 0}
          empty={{ icon: "VideoCamera", title: "No past calls yet", description: "What we agreed on each call shows here." }}
        >
          {(view) => (
            <Table>
              <TableHead>
                <TableHeader>Date</TableHeader>
                <TableHeader>About</TableHeader>
                <TableHeader hideOnPhone>What we agreed</TableHeader>
              </TableHead>
              <TableBody>
                {view.past.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{formatDate(new Date(row.startsAtIso))}</TableCell>
                    <TableCell className="text-ink">{row.about}</TableCell>
                    <TableCell hideOnPhone>{row.agreed ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PanelData>
      </div>
    </>
  );
}

/**
 * Help & calls, Contact us tab (mock: screens-c.js, help contact): email us, or send a request. The mock's WhatsApp panel is
 * left out until there is a WhatsApp number and hours to show (no source holds them).
 */
export function HelpContactScreen({ book }: { readonly book: BookOptions | null }) {
  return (
    <>
      <HelpHeader current="/help/contact" actions={<BookCallButton book={book} />} />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Email">
          <p className="type-body text-ink-2">
            <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a>
          </p>
          <div className="mt-3">
            <LinkButton href="/requests?new=1" icon="Plus">
              Send a request instead
            </LinkButton>
          </div>
        </Panel>
      </div>
    </>
  );
}
