import { listDealsOnShowForStaff } from "@fynix/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { localDateIn } from "@fynix/shared/lib/calendar/local-date";
import { DIRECTORY_DEALS_TIME_ZONE } from "@fynix/shared/lib/directory/deals-contract";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { buttonDanger } from "@/components/console/buttons";
import { Figures } from "@/components/console/figures";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { takeDownDealAction } from "./actions";

export const metadata: Metadata = { title: "Deals" };

const NOTICES: Readonly<Record<string, { readonly ok: boolean; readonly text: string }>> = {
  "taken-down": { ok: true, text: "Taken down. It leaves the website within a minute, and the owner sees why." },
  unchanged: { ok: false, text: "That deal was already gone." },
  invalid: { ok: false, text: "Give a reason of up to 300 characters." },
};

interface DealsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The deals on show today, newest last, each with a take-down that asks for the reason its owner will read. */
export default async function DealsPage({ searchParams }: DealsPageProps): Promise<ReactElement> {
  await requireStaffAccess();
  const params = await searchParams;
  const today = localDateIn(DIRECTORY_DEALS_TIME_ZONE, new Date());
  const deals = await listDealsOnShowForStaff(getStaffDb(), today);
  const code = typeof params.notice === "string" && Object.hasOwn(NOTICES, params.notice) ? params.notice : null;
  const notice = code === null ? null : NOTICES[code];

  return (
    <>
      <PageHeader title="Deals" meta="Offers owners have put up, on show today. They go live without a check; take one down if it should not be there." />
      {notice === undefined || notice === null ? null : (
        <p role="status" className={`mt-6 max-w-2xl rounded-control px-4 py-3 text-sm ${notice.ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}>
          {notice.text}
        </p>
      )}
      <Figures items={[{ value: deals.length, label: "On show" }]} />
      {deals.length === 0 ? (
        <EmptyLine>No deals on show.</EmptyLine>
      ) : (
        <ul aria-label="Deals on show" className="mt-6 border-t border-line">
          {deals.map((deal) => (
            <li key={deal.id} className="grid gap-3 border-b border-line py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-full bg-accent-pale px-2.5 py-0.5 text-[0.75rem] font-semibold text-accent-deep">{deal.badge}</span>
                  <span className="font-semibold text-ink">{deal.title}</span>
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {deal.businessName} · {deal.terms} · <span className="tabular-nums">{deal.startsOn}</span> to <span className="tabular-nums">{deal.endsOn}</span>
                </p>
              </div>
              <form action={takeDownDealAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="dealId" value={deal.id} />
                <label htmlFor={`reason-${deal.id}`} className="sr-only">
                  Reason the owner will read
                </label>
                <input
                  id={`reason-${deal.id}`}
                  name="reason"
                  required
                  maxLength={300}
                  placeholder="Why it is coming down *"
                  className="w-64 rounded-control border border-ink-soft/65 bg-paper px-3 py-2 text-sm"
                />
                <GatedSubmitButton className={buttonDanger} pendingLabel="Taking down…">
                  Take down
                </GatedSubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
