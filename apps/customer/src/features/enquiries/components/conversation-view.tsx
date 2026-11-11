"use client";

import { useState, useTransition } from "react";
import { Badge, Banner, Button } from "@/ui";
import { formatDateTime } from "@/lib/format";
import { cx } from "@/ui/cx";
import { openConversationAction, type OpenedConversation } from "../actions";
import { CONVERSATION_NOTICES, MESSAGE_AUTHOR_LABELS, messageCountLabel } from "../rules";

type Shown = { readonly enquiryId: string; readonly result: { readonly ok: true; readonly data: OpenedConversation } | { readonly ok: false; readonly message: string } };

/**
 * What a visitor and the OyeChats assistant said. The server is asked when the button is pressed (nothing is kept in the
 * page), and says plainly when the conversation cannot be shown. Message text is always rendered as text, never as markup.
 */
export function ConversationView({ enquiryId }: { readonly enquiryId: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pending, start] = useTransition();
  const result = shown?.enquiryId === enquiryId ? shown.result : null;

  const open = () =>
    start(async () => {
      try {
        const opened = await openConversationAction(enquiryId);
        setShown({ enquiryId, result: opened.ok ? { ok: true, data: opened.data as OpenedConversation } : { ok: false, message: opened.message } });
      } catch {
        setShown({ enquiryId, result: { ok: false, message: CONVERSATION_NOTICES.unavailable } });
      }
    });

  return (
    <div className="flex flex-col gap-3" aria-live="polite" aria-busy={pending}>
      {result === null ? (
        <div>
          <Button icon="ChatCircleDots" pending={pending} onClick={open}>
            View conversation
          </Button>
        </div>
      ) : !result.ok ? (
        <Banner tone="warn">{result.message}</Banner>
      ) : result.data.messages.length === 0 ? (
        <p className="type-meta">{CONVERSATION_NOTICES.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 type-meta">
            {result.data.warmth === null ? null : <Badge tone="accent">{`${result.data.warmth} lead`}</Badge>}
            <span>{messageCountLabel(result.data.messages.length)}</span>
          </div>
          <ol aria-label="Messages" className="flex flex-col gap-3">
            {result.data.messages.map((message, index) => (
              <li key={`${message.at ?? "unknown"}-${index}`} className={cx("flex max-w-11/12 flex-col gap-1", message.author === "visitor" ? "self-start" : "items-end self-end")}>
                <p className="type-meta">
                  {MESSAGE_AUTHOR_LABELS[message.author]}
                  {message.at === null ? "" : `, ${formatDateTime(new Date(message.at))}`}
                </p>
                <p className={cx("rounded-control px-3 py-2 type-body whitespace-pre-wrap break-words", message.author === "visitor" ? "bg-surface-subtle" : "bg-accent-wash")}>{message.text}</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
