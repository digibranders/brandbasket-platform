import { listOpenChannelLinkRequests } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { TableScroll } from "@/components/console/table-scroll";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { answerChannelRequestAction, type ChannelRequestNotice } from "./actions";

export const metadata: Metadata = { title: "Channel requests" };

const NOTICES: Readonly<Record<ChannelRequestNotice, string>> = {
  saved: "Saved.",
  invalid: "That did not go through. Reload the page and try again.",
  reason: "Write why it cannot be set up, so the customer can read it.",
  "not-found": "That request is gone: the customer took it back or sent a new one.",
};

const NETWORK_NAMES = { instagram: "Instagram", facebook: "Facebook" } as const;
const STATE_WORDS = { requested: "Waiting for you", invited: "Invited, waiting for her to press Allow", refused: "Refused", connected: "Connected" } as const;

const BUTTON = "rounded-lg border border-ink-2/65 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5";

/** The profile links customers sent for Instagram and Facebook, until Meta approves our app: add them as testers, then mark them invited. */
export default async function ChannelRequestsPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "channel-requests.list", targetType: "clients" });
  const params = await searchParams;
  const raw = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const notice = raw !== undefined && raw in NOTICES ? NOTICES[raw as ChannelRequestNotice] : null;
  const rows = await listOpenChannelLinkRequests(getStaffDb());
  return (
    <>
      <PageHeader title="Channel requests" back={{ href: "/clients", label: "Clients" }} meta={`${rows.length} to do`} />
      <div className="mt-8 space-y-4">
        <p className="max-w-2xl text-sm text-ink-2">
          A customer sent the link to her Instagram profile or Facebook page. Open it, add her as a tester in the Meta app, then press Invited. She is told to accept the
          invite and press Allow. If it cannot be set up, press Refuse and say why: she reads it.
        </p>
        {notice === null ? null : (
          <p role="status" className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-ink">
            {notice}
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyLine>No profile links are waiting.</EmptyLine>
        ) : (
          <TableScroll label="Channel requests">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Customer</th>
                  <th className={TH}>Network</th>
                  <th className={TH}>Profile</th>
                  <th className={TH}>Sent</th>
                  <th className={TH}>Where it stands</th>
                  <th className={TH}>Answer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={TD}>
                      <Link href={`/clients/${row.businessId}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                        {row.businessName}
                      </Link>
                    </td>
                    <td className={TD}>{NETWORK_NAMES[row.network]}</td>
                    <td className={TD}>
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                        {row.handle}
                      </a>
                    </td>
                    <td className={TD_TIME}>
                      <LocalDate iso={row.createdAt.toISOString()} />
                    </td>
                    <td className={TD}>{STATE_WORDS[row.state]}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.state === "requested" ? (
                          <form action={answerChannelRequestAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="businessId" value={row.businessId} />
                            <input type="hidden" name="intent" value="invited" />
                            <button type="submit" className={BUTTON}>
                              Invited
                            </button>
                          </form>
                        ) : null}
                        {row.state === "invited" ? (
                          <form action={answerChannelRequestAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="businessId" value={row.businessId} />
                            <input type="hidden" name="intent" value="connected" />
                            <button type="submit" className={BUTTON}>
                              Mark connected
                            </button>
                          </form>
                        ) : null}
                        <form action={answerChannelRequestAction} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="businessId" value={row.businessId} />
                          <input type="hidden" name="intent" value="refused" />
                          <label htmlFor={`reason-${row.id}`} className="sr-only">
                            Why it cannot be set up
                          </label>
                          <input id={`reason-${row.id}`} name="reason" maxLength={400} placeholder="Why it cannot be set up" className="w-56 rounded-lg border border-ink-2/65 bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-2" />
                          <button type="submit" className={BUTTON}>
                            Refuse
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </>
  );
}
