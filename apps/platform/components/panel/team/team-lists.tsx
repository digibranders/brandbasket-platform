"use client";

import { useState, useTransition, type ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { removeMemberAction, revokeInviteAction } from "@/app/app-host/(protected)/settings/team/actions";
import { roleLabel, type MemberRole, type TeamResult } from "@/lib/team/rules";

export interface MemberRowData {
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: MemberRole;
  readonly isYou: boolean;
  /** Written by the server ("12 Nov 2026"), so the browser never formats a date of its own. */
  readonly joined: string;
}

export interface InviteRowData {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly expired: boolean;
  readonly sent: string;
  readonly expires: string;
}

interface RowAction {
  readonly label: string;
  /** The one sentence asked before it happens. */
  readonly question: string;
  readonly confirm: string;
  readonly run: () => Promise<TeamResult>;
}

/** A row's destructive action, confirmed inline in the row (never in a modal): one sentence, "Yes, ..." and "Keep ...". */
function RowButton({ action }: { readonly action: RowAction }): ReactElement {
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const run = (): void => {
    startTransition(async () => {
      const result = await action.run();
      if (result.ok) setAsking(false);
      else setProblem(result.message);
    });
  };

  if (!asking) {
    return (
      <button type="button" className={SOFT_BUTTON} onClick={() => setAsking(true)}>
        {action.label}
      </button>
    );
  }
  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <p className="text-[0.9375rem] text-ink">{action.question}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={`${SOFT_BUTTON} disabled:opacity-55`} onClick={run}>
          {pending ? "Working…" : action.confirm}
        </button>
        <button
          type="button"
          disabled={pending}
          className={`${SOFT_BUTTON} disabled:opacity-55`}
          onClick={() => {
            setAsking(false);
            setProblem(null);
          }}
        >
          Keep
        </button>
      </div>
      {problem === null ? null : (
        <p role="alert" className="text-[0.9375rem] font-semibold text-error">
          {problem}
        </p>
      )}
    </div>
  );
}

function Row({ title, detail, action }: { readonly title: string; readonly detail: string; readonly action: ReactElement | null }): ReactElement {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="break-words text-base font-semibold text-ink">{title}</p>
        <p className="mt-0.5 break-words text-[0.9375rem] text-ink-2">{detail}</p>
      </div>
      {action}
    </li>
  );
}

/** Everyone who can open the dashboard. The owner has no Remove, and neither do you. */
export function MemberList({ members }: { readonly members: readonly MemberRowData[] }): ReactElement {
  return (
    <ul className="divide-y divide-line">
      {members.map((member) => (
        <Row
          key={member.userId}
          title={member.isYou ? `${member.name} (you)` : member.name}
          detail={`${roleLabel(member.role)}${member.email === null ? "" : `, ${member.email}`}, joined ${member.joined}`}
          action={
            member.role === "owner" || member.isYou ? null : (
              <RowButton
                action={{
                  label: "Remove",
                  question: `Remove ${member.name}? They lose access at once.`,
                  confirm: "Yes, remove",
                  run: () => removeMemberAction(member.userId),
                }}
              />
            )
          }
        />
      ))}
    </ul>
  );
}

/** Invitations still waiting, open or expired. An expired one still blocks inviting its address until it is revoked. */
export function InviteList({ invites }: { readonly invites: readonly InviteRowData[] }): ReactElement {
  return (
    <ul className="divide-y divide-line">
      {invites.map((invite) => (
        <Row
          key={invite.id}
          title={invite.email}
          detail={`${roleLabel(invite.role)}, sent ${invite.sent}, ${invite.expired ? `expired ${invite.expires}` : `expires ${invite.expires}`}`}
          action={
            <RowButton
              action={{
                label: "Revoke",
                question: `Revoke the invitation to ${invite.email}?`,
                confirm: "Yes, revoke",
                run: () => revokeInviteAction(invite.id),
              }}
            />
          }
        />
      ))}
    </ul>
  );
}
