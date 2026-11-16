import { PanelError } from "@/components";
import { SettingsCard } from "@/features/settings/components/settings-card";
import { formatDate } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import type { TeamMember } from "../loader";
import { ROLE_HELP, roleLabel, type PendingInvite } from "../rules";
import { InviteDialog } from "./invite-dialog";
import { RemoveMemberButton } from "./remove-member-button";
import { RevokeInviteButton } from "./revoke-invite-button";

export interface TeamPanelsProps {
  readonly members: Loaded<readonly TeamMember[]>;
  readonly invites: Loaded<readonly PendingInvite[]>;
}

/** Settings, Team: the people with access, and the invitations still waiting. The owner sees it; the page has asked requireOwner. */
export function TeamPanels({ members, invites }: TeamPanelsProps) {
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title="People with access" tone="focal" flush action={<InviteDialog />}>
        {!members.ok ? (
          <div className="px-5 pb-5 sm:px-7 sm:pb-7">
            <PanelError failure={members.error} what="your team" />
          </div>
        ) : (
          <>
          <Table aria-label="People with access">
            <TableHead>
              <TableHeader>Name</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader hideOnPhone>Joined</TableHeader>
              <TableHeader align="end">
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableHead>
            <TableBody>
              {members.data.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="type-sub">
                    {member.name}
                    {member.isYou ? " (you)" : ""}
                    {member.email === null ? null : <span className="block type-meta font-normal">{member.email}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{roleLabel(member.role)}</Badge>
                  </TableCell>
                  <TableCell hideOnPhone>{formatDate(member.joinedAt, now)}</TableCell>
                  <TableCell align="end">{member.role === "owner" || member.isYou ? null : <RemoveMemberButton userId={member.userId} name={member.name} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {members.data.length <= 1 ? (
            <div className="px-5 pb-5 sm:px-7 sm:pb-7">
              <EmptyState icon="UserCircle" title="No colleagues invited yet" description="Invite a colleague to review posts and approve website updates with you." />
            </div>
          ) : null}
          <p className="border-t border-border-subtle px-5 py-3 type-meta sm:px-7">{ROLE_HELP}</p>
          </>
        )}
      </SettingsCard>

      <InvitesPanel invites={invites} now={now} />
    </div>
  );
}

function InvitesPanel({ invites, now }: { readonly invites: Loaded<readonly PendingInvite[]>; readonly now: Date }) {
  // Nothing waiting is nothing to show; a failed read still says so.
  if (invites.ok && invites.data.length === 0) return null;
  return (
    <SettingsCard title="Waiting for a reply" flush>
      {!invites.ok ? (
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <PanelError failure={invites.error} what="your invitations" />
        </div>
      ) : (
        <Table aria-label="Invitations waiting for a reply">
          <TableHead>
            <TableHeader>Email</TableHeader>
            <TableHeader hideOnPhone>Role</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader align="end">
              <span className="sr-only">Actions</span>
            </TableHeader>
          </TableHead>
          <TableBody>
            {invites.data.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="type-sub break-all">{invite.email}</TableCell>
                <TableCell hideOnPhone>{roleLabel(invite.role)}</TableCell>
                <TableCell>
                  {invite.status === "open" ? <Badge tone="info">{`Expires ${formatDate(invite.expiresAt, now)}`}</Badge> : <Badge tone="warn">Expired</Badge>}
                </TableCell>
                <TableCell align="end">
                  <RevokeInviteButton inviteId={invite.id} email={invite.email} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsCard>
  );
}
