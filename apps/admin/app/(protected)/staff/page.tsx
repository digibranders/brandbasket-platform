import { listOpenStaffInvites, listStaffRoster } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonDanger, buttonPrimary, buttonSmall } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { StatusPill, type PillTone } from "@/components/console/status-pill";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { readStaffNotice, STAFF_NOTICES } from "@/lib/staff-notices";
import { ROLE_CAN, ROLE_LABELS, ROLE_ORDER } from "@/lib/staff-roles";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffCan } from "@/lib/server/staff-role";
import { changeStaffRoleAction, inviteStaffAction, resendStaffInviteAction, switchOffStaffAction, switchOnStaffAction } from "./actions";

export const metadata: Metadata = { title: "Staff" };

const ROLE_TONE = { admin: "progress", finance: "wait", support: "todo" } as const satisfies Record<string, PillTone>;

/** The team: who can open the console, with which role, and who has been invited (mock screen 9). Admins only. */
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

  return (
    <>
      <PageHeader title="Staff" meta={`${active} ${active === 1 ? "person" : "people"} · ${invites.length} invited`} />
      {notice === null ? null : (
        <Notice tone={STAFF_NOTICES[notice].ok ? "ok" : "problem"} className="mt-6">
          {STAFF_NOTICES[notice].text}
        </Notice>
      )}

      <Section title="Invite someone">
        <form action={inviteStaffAction} className="grid max-w-2xl gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
          <div>
            <label htmlFor="invite-email" className={labelClasses}>
              Work email
            </label>
            <input id="invite-email" name="email" type="email" required maxLength={254} autoComplete="off" className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="invite-role" className={labelClasses}>
              Role
            </label>
            <select id="invite-role" name="role" defaultValue="support" className={fieldClasses}>
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonPrimary}>
            Invite someone
          </button>
        </form>
      </Section>

      <Section title="Team">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Person</th>
              <th className={TH}>Role</th>
              <th className={TH}>Can</th>
              <th className={TH}>Last in</th>
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
                <td className={TD}>
                  {member.active ? <StatusPill tone={ROLE_TONE[member.role]}>{ROLE_LABELS[member.role]}</StatusPill> : <StatusPill tone="problem">Switched off</StatusPill>}
                </td>
                <td className={`${TD} text-ink-2`}>{ROLE_CAN[member.role]}</td>
                <td className={TD_TIME}>{member.lastSignInAt === null ? "Never" : <LocalDateTime iso={member.lastSignInAt.toISOString()} variant="timestamp" />}</td>
                <td className={`${TD} text-right`}>
                  {member.userId === user.id ? null : (
                    <div className="flex flex-wrap justify-end gap-2">
                      <form action={changeStaffRoleAction} className="flex gap-2">
                        <input type="hidden" name="userId" value={member.userId} />
                        <label htmlFor={`role-${member.userId}`} className="sr-only">
                          Role for {member.name}
                        </label>
                        <select id={`role-${member.userId}`} name="role" defaultValue={member.role} className="rounded-lg border border-ink-2/65 bg-surface px-2 text-sm">
                          {ROLE_ORDER.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={buttonSmall}>
                          Save role
                        </button>
                      </form>
                      <form action={member.active ? switchOffStaffAction : switchOnStaffAction}>
                        <input type="hidden" name="userId" value={member.userId} />
                        <button type="submit" className={member.active ? `${buttonDanger} h-7 px-2.5 text-xs` : buttonSmall}>
                          {member.active ? "Switch off" : "Switch on"}
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Invited">
        {invites.length === 0 ? (
          <EmptyLine>No open invites.</EmptyLine>
        ) : (
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Email</th>
                <th className={TH}>Role</th>
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
                  <td className={TD}>{ROLE_LABELS[invite.role]}</td>
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
        )}
      </Section>
    </>
  );
}
