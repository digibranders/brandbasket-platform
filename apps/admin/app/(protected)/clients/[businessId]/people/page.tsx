import { findOpenClosureForBusiness, listBusinessMembersForStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { staffCan } from "@brandbasket/shared/lib/access";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { PEOPLE_NOTICES, readPeopleNotice } from "@/lib/people-notices";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { extendClosureAction, renameOwnerAction, restoreClosureAction } from "./actions";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Client people" };

export default async function ClientPeoplePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "people");
  const notice = readPeopleNotice((await searchParams).people);
  const db = getStaffDb();
  const [members, closure] = await Promise.all([listBusinessMembersForStaff(db, client.businessId), findOpenClosureForBusiness(db, client.businessId)]);
  const owners = members.filter((member) => member.role === "owner");
  const isAdmin = staffCan(granted.staff.role, "oversight");

  return (
    <>
      {notice === null ? null : (
        <div className="mb-8">
          <Notice tone={PEOPLE_NOTICES[notice].ok ? "ok" : "problem"}>{PEOPLE_NOTICES[notice].text}</Notice>
        </div>
      )}

      <Section title="People" aside={`${members.length} with access`}>
        {members.length === 0 ? (
          <Quiet>Nobody can open this business&apos;s dashboard.</Quiet>
        ) : (
          <TableScroll label="People">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Person</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>Mobile</th>
                  <th className={TH}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId}>
                    <td className={TD}>
                      <b className="font-semibold">{member.name}</b>
                      <small className="block text-xs text-ink-2">{member.email ?? "Signs in with a mobile number"}</small>
                    </td>
                    <td className={TD}>
                      <StatusPill tone={member.role === "owner" ? "progress" : "todo"}>{member.role === "owner" ? "Owner" : "Editor"}</StatusPill>
                    </td>
                    <td className={TD}>{member.phone === null ? "None" : (displayPhoneText(member.phone) ?? member.phone)}</td>
                    <td className={TD_TIME}>
                      <LocalDate iso={member.joinedAt.toISOString()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {owners.map((owner) => (
        <Section key={owner.userId} title={owners.length === 1 ? "Owner's name" : `Owner's name: ${owner.name}`}>
          <form action={renameOwnerAction} className="flex max-w-xl flex-wrap items-end gap-3">
            <input type="hidden" name="businessId" value={client.businessId} />
            <input type="hidden" name="userId" value={owner.userId} />
            <div className="min-w-0 flex-1 basis-64">
              <label htmlFor={`owner-name-${owner.userId}`} className={labelClasses}>
                Name shown on their dashboard and in emails
              </label>
              <input id={`owner-name-${owner.userId}`} name="name" type="text" required maxLength={60} defaultValue={owner.name} className={fieldClasses} />
            </div>
            <GatedSubmitButton className={buttonSecondary} pendingLabel="Saving...">
              Save name
            </GatedSubmitButton>
          </form>
          <p className="mt-3 max-w-xl text-sm text-ink-2">Their sign-in email and mobile number can only be changed by them, in their own Settings.</p>
        </Section>
      ))}

      <Section title="Leaving" id="leaving">
        {closure === null ? (
          <Quiet>This account is not leaving.</Quiet>
        ) : (
          <div className="grid max-w-xl gap-4">
            <p className="text-sm">
              Asked to delete on <LocalDate iso={closure.requestedAt.toISOString()} />. Erased on <LocalDate iso={closure.eraseAfter.toISOString()} /> unless restored.
            </p>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <form action={restoreClosureAction}>
                  <input type="hidden" name="businessId" value={client.businessId} />
                  <button type="submit" className={buttonSmall}>
                    Restore account
                  </button>
                </form>
                <form action={extendClosureAction}>
                  <input type="hidden" name="businessId" value={client.businessId} />
                  <button type="submit" className={buttonSmall}>
                    Extend by 30 days
                  </button>
                </form>
              </div>
            ) : (
              <p className="text-sm text-ink-2">Only an admin can restore or extend it.</p>
            )}
          </div>
        )}
      </Section>
    </>
  );
}
