"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { conversationsAvailable, type LeadTableRow } from "@/lib/chatbots-view";
import { LeadConversationDialog } from "./lead-conversation-dialog";

const TH = "py-3 pr-4 text-left text-xs font-medium text-ink-soft";
const TD = "py-3.5 pr-4 align-middle";

function LeadName({ row, showBot }: { readonly row: LeadTableRow; readonly showBot: boolean }): ReactElement {
  return (
    <>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-pale text-sm font-semibold text-accent-deep">
        {row.initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{row.title}</span>
        {showBot && row.botName !== null ? <span className="block truncate text-xs text-ink-soft">{row.botName}</span> : null}
      </span>
    </>
  );
}

/**
 * The leads OyeChats collected, one row per visitor who left their details: a serial number (which carries on from page to
 * page), their name and how many messages they exchanged. Selecting a row opens the conversation in a pop-up.
 *
 * While no lead's conversation can be read (no operator key saved yet, or OyeChats cannot be reached) there is nothing to count
 * or open, so the Messages column is left out and the rows are plain; both come back on their own once conversations can be read.
 * A single lead OyeChats has nothing for still shows a dash, and its pop-up says the conversation is not available.
 */
export function LeadTable({
  rows,
  showBot,
  firstNumber,
}: {
  readonly rows: readonly LeadTableRow[];
  readonly showBot: boolean;
  /** The serial number of the first row: 1 on the first page, 11 on the second. */
  readonly firstNumber: number;
}): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((row) => row.id === openId) ?? null;
  const readable = conversationsAvailable(rows);

  return (
    <>
      <div className="mt-4 max-w-3xl overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{readable ? "Leads from OyeChats. Select a lead to read the conversation." : "Leads from OyeChats."}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={cn(TH, "w-14")}>
                No.
              </th>
              <th scope="col" className={cn(TH, readable ? undefined : "pr-0")}>
                Lead
              </th>
              {readable ? (
                <th scope="col" className={cn(TH, "w-28 pr-0")}>
                  Messages
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                onClick={readable ? () => setOpenId(row.id) : undefined}
                className={cn("border-b border-line/60", readable && "cursor-pointer transition-colors duration-200 ease-calm hover:bg-paper-deep/50")}
              >
                <td className={cn(TD, "tabular-nums text-ink-soft")}>{firstNumber + index}</td>
                <td className={cn(TD, readable ? undefined : "pr-0")}>
                  {readable ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      className="flex w-full min-w-0 cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <LeadName row={row} showBot={showBot} />
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center gap-3">
                      <LeadName row={row} showBot={showBot} />
                    </div>
                  )}
                </td>
                {readable ? (
                  <td className={cn(TD, "pr-0 tabular-nums text-ink-soft")} title={row.messages === null ? "Not available right now" : undefined}>
                    {row.messages === null ? "-" : row.messages}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open === null ? null : <LeadConversationDialog row={open} onClose={() => setOpenId(null)} />}
    </>
  );
}
