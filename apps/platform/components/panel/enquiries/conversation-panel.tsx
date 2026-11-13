"use client";

import { useEffect, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { formatTimestamp } from "@brandbasket/shared/lib/format";
import { openLeadConversationAction, type OpenedConversation } from "@/app/app-host/(protected)/website/enquiries/actions";
import { CONVERSATION_NOTICES, MESSAGE_AUTHOR_LABELS } from "@/lib/chatbots-view";

type Loaded = { readonly leadId: string; readonly result: OpenedConversation | "failed" };

/**
 * What a visitor and the OyeChats assistant said, for one chat enquiry. It asks the server for the conversation when it
 * opens (nothing is kept in the page) and says plainly when it cannot be shown. Message text is always rendered as text.
 */
export function ConversationPanel({ leadId }: { readonly leadId: string }): ReactElement {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let current = true;
    openLeadConversationAction(leadId)
      .then((result) => {
        if (current) setLoaded({ leadId, result });
      })
      .catch(() => {
        if (current) setLoaded({ leadId, result: "failed" });
      });
    return () => {
      current = false;
    };
  }, [leadId]);

  const result = loaded?.leadId === leadId ? loaded.result : null;

  return (
    <section aria-label="Conversation" aria-live="polite" aria-busy={result === null} className="grid gap-3">
      <h3 className="text-[0.9375rem] font-semibold text-ink">Conversation</h3>
      {result === null ? (
        <p className="text-sm text-ink-2">Loading the conversation.</p>
      ) : result === "failed" || result.status !== "ok" ? (
        <p role="status" className="rounded-control bg-sunken px-4 py-3 text-sm text-ink">
          {CONVERSATION_NOTICES[result === "failed" ? "unavailable" : result.status]}
        </p>
      ) : result.messages.length === 0 ? (
        <p className="text-sm text-ink-2">{CONVERSATION_NOTICES.empty}</p>
      ) : (
        <ol aria-label="Messages" className="flex flex-col gap-4">
          {result.messages.map((message, index) => (
            <li key={`${message.at ?? "unknown"}-${index}`} className={cn("flex max-w-[85%] flex-col gap-1", message.author === "visitor" ? "self-start" : "items-end self-end")}>
              <p className="text-[0.8125rem] text-ink-2">
                {MESSAGE_AUTHOR_LABELS[message.author]}
                {message.at === null ? "" : ` · ${formatTimestamp(new Date(message.at), "Asia/Kolkata")}`}
              </p>
              <p className={cn("whitespace-pre-wrap break-words rounded-lg px-4 py-2.5 text-[0.9375rem] text-ink", message.author === "visitor" ? "bg-sunken" : message.author === "team" ? "bg-ok-wash" : "bg-rattan-wash")}>
                {message.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
