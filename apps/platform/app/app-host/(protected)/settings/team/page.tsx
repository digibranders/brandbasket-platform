import type { Metadata } from "next";
import type { ReactElement } from "react";
import { InviteForm } from "@/components/panel/team/invite-form";
import { InviteList, MemberList, type InviteRowData, type MemberRowData } from "@/components/panel/team/team-lists";
import { PageFrame, PageSection } from "@/components/v2/page";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadInvites, loadMembers } from "@/lib/server/team";
import { ROLE_HELP, teamDate } from "@/lib/team/rules";
import { inviteAction } from "./actions";

export const metadata: Metadata = { title: "Team" };

/** Who can open this business's dashboard, and the invitations still waiting. The owner's alone: everyone else is sent Home. */
export default async function TeamPage(): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess({ access: "owner" });
  const [members, invites] = await Promise.all([loadMembers(tenant), loadInvites(tenant)]);

  const memberRows: readonly MemberRowData[] = members.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    isYou: member.isYou,
    joined: teamDate(member.joinedAt),
  }));
  const inviteRows: readonly InviteRowData[] = invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expired: invite.status === "expired",
    sent: teamDate(invite.sentAt),
    expires: teamDate(invite.expiresAt),
  }));

  return (
    <PageFrame title="Team" lede={ROLE_HELP} width="form">
      <PageSection id="people" title="People with access">
        <MemberList members={memberRows} />
      </PageSection>

      {inviteRows.length === 0 ? null : (
        <PageSection id="invitations" title="Invitations">
          <InviteList invites={inviteRows} />
        </PageSection>
      )}

      <PageSection id="invite" title="Invite someone">
        <InviteForm action={inviteAction} />
      </PageSection>
    </PageFrame>
  );
}
