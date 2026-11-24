import { listOpenStaffInvites, listStaffRoster } from "@brandbasket/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { protectionLines } from "@/lib/protection-status";
import { verifyCloudflareAccess } from "@/lib/server/cloudflare-access";
import { serverEnv } from "@/lib/server/env";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonDanger, buttonPrimary, buttonSmall } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { readStaffNotice, STAFF_NOTICES } from "@/lib/staff-notices";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";
import { inviteStaffAction, resendStaffInviteAction, switchOffStaffAction, switchOnStaffAction } from "./actions";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Access" };

/** Access: who can sign in to the console and how it is protected. One staff account; no roles to choose. Admins only. */
export default async function StaffPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffCan("oversight");
  const db = getStaffDb();
  const [roster, invites, params] = await Promise.all([listStaffRoster(db), listOpenStaffInvites(db), searchParams]);
  const notice = readStaffNotice(params.notice);
  const now = new Date();
  const active = roster.filter((member) => member.active).length;
  const protection = protectionLines({
    required: serverEnv().REQUIRE_CF_ACCESS === "1",
    verified: await verifyCloudflareAccess({ headers: await headers() }),
  });

  return (
    <>
      <PageHeader title="Access" meta={`Who can sign in to this console, and how it is protected. ${active} active ${active === 1 ? "account" : "accounts"}.`} />
      <SectionTabs page="/staff" />
      {notice === null ? null : (
        <Notice tone={STAFF_NOTICES[notice].ok ? "ok" : "problem"} className="mt-6">
          {STAFF_NOTICES[notice].text}
        </Notice>
      )}

      <Section title="Sign-in protection">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={protection.tone}>{protection.headline}</StatusPill>
          <p className="text-sm text-ink-2">{protection.detail}</p>
        </div>
      </Section>

      <Section title="Recovery administrator" aside="Offline recovery only">
        <p className="mb-4 max-w-2xl text-sm text-ink-2">An invite is for the recovery administrator only. There are no roles to choose: every account is the same.</p>
        <form action={inviteStaffAction} className="grid max-w-2xl gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="role" value="admin" />
          <div>
            <label htmlFor="invite-email" className={labelClasses}>
              Email
            </label>
            <input id="invite-email" name="email" type="email" required maxLength={254} autoComplete="off" className={fieldClasses} />
          </div>
          <button type="submit" className={buttonPrimary}>
            Send invite
          </button>
        </form>
      </Section>

      <Section title="Staff account">
        <TableScroll label="Staff accounts">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Person</th>
                <th className={TH}>Status</th>
                <th className={TH}>Last signed in</th>
                <th className={TH}>
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.map((member) => (
                <tr key={member.userId}>
                  <td className={TD}>
                    <b className="font-semibold">{member.name}</b>
                    {member.userId === user.id ? <span className="ml-2 text-xs text-ink-2">You</span> : null}
                    <span className="block text-xs text-ink-2">{member.email}</span>
                  </td>
                  <td className={TD}>{member.active ? <StatusPill tone="done">Active</StatusPill> : <StatusPill tone="problem">Switched off</StatusPill>}</td>
                  <td className={TD_TIME}>{member.lastSignInAt === null ? "Never" : <LocalDateTime iso={member.lastSignInAt.toISOString()} variant="timestamp" />}</td>
                  <td className={`${TD} text-right`}>
                    {member.userId === user.id ? null : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {member.active ? (
                          <ConfirmDialog
                            title={`Switch off ${member.name}`}
                            consequence="They are signed out everywhere now and cannot sign in until someone switches them back on."
                            triggerLabel="Switch off"
                            triggerClassName={`${buttonDanger} h-7 px-2.5 text-xs`}
                            confirmLabel="Switch off"
                            cancelLabel="Keep them on"
                            formAction={switchOffStaffAction}
                          >
                            <input type="hidden" name="userId" value={member.userId} />
                          </ConfirmDialog>
                        ) : (
                          <form action={switchOnStaffAction}>
                            <input type="hidden" name="userId" value={member.userId} />
                            <button type="submit" className={buttonSmall}>
                              Switch on
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Section>

      <Section title="Open invites">
        {invites.length === 0 ? (
          <EmptyLine>No open invites.</EmptyLine>
        ) : (
          <TableScroll label="Invited">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Email</th>
                  <th className={TH}>Sent</th>
                  <th className={TH}>Link</th>
                  <th className={TH}>
                    <span className="sr-only">Resend</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className={TD}>{invite.email}</td>
                    <td className={TD_TIME}>
                      <LocalDateTime iso={invite.createdAt.toISOString()} variant="timestamp" />
                    </td>
                    <td className={TD}>{invite.expiresAt > now ? <StatusPill tone="wait">Not joined</StatusPill> : <StatusPill tone="todo">Expired</StatusPill>}</td>
                    <td className={`${TD} text-right`}>
                      <form action={resendStaffInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button type="submit" className={buttonSmall}>
                          Resend
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
    </>
  );
}
