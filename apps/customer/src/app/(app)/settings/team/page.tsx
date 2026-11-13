import type { Metadata } from "next";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { TeamPanels } from "@/features/team/components/team-panels";
import { loadInvites, loadMembers } from "@/features/team/loader";
import { requireOwner } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const metadata: Metadata = { title: "Team" };

/** Settings, Team: who can open this dashboard, and the invitations still waiting. The owner's alone; others are sent Home. */
export default async function TeamPage() {
  const customer = await requireOwner();
  const now = new Date();
  const [members, invites] = await Promise.all([load("team.members", () => loadMembers(customer)), load("team.invites", () => loadInvites(customer, now))]);
  return (
    <>
      <SettingsHeader current="/settings/team" showTeam />
      <TeamPanels members={members} invites={invites} />
    </>
  );
}
