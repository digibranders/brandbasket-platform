"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components";
import { Banner, Button, Icon, LinkButton, Sheet, useToast } from "@/ui";
import { approvePostsAction } from "../actions";
import { APPROVAL_NOTICES, MAX_APPROVE, approveAllLabel, type ApprovalCard } from "../rules";

export interface ApprovalsPanelProps {
  readonly cards: readonly ApprovalCard[];
  /** "3 posts need your OK by Wed 25 Nov". */
  readonly headline: string;
  /** Owners and editors on a paid plan. Viewers can open a post but not approve it. */
  readonly canApprove: boolean;
  /** Whether the person may send a request about a post. */
  readonly canAsk: boolean;
  readonly layout: "rows" | "cards";
}

function Picture({ card, className }: { readonly card: ApprovalCard; readonly className: string }) {
  if (card.imageSrc === null) {
    return (
      <div className={`${className} flex items-center justify-center bg-neutral-wash text-ink-muted`}>
        <Icon name="Image" size="lg" />
      </div>
    );
  }
  // A private, same-origin picture route: next/image would add nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={card.imageSrc} alt={`The picture for the post "${card.title}"`} className={`${className} object-cover`} />;
}

/**
 * The posts waiting for the customer's OK: Approve on each, Approve all when several wait, and a Review sheet with the
 * caption and Ask for a change. Nothing goes out until it is approved.
 */
export function ApprovalsPanel({ cards, headline, canApprove, canAsk, layout }: ApprovalsPanelProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = cards.find((card) => card.id === openId) ?? null;
  const allIds = cards.slice(0, MAX_APPROVE).map((card) => card.id);

  function approve(ids: readonly string[], which: string) {
    setTarget(which);
    setMessage(null);
    startTransition(async () => {
      const result = await approvePostsAction(ids);
      setOpenId(null);
      if (!result.ok) {
        setMessage(result.message);
      } else if (result.data?.outcome === "approved") {
        toast(APPROVAL_NOTICES.approved.text);
      } else {
        setMessage(APPROVAL_NOTICES.changed.text);
      }
    });
  }

  const approveButton = (card: ApprovalCard, variant: "primary" | "secondary" = "primary") =>
    canApprove ? (
      <Button size="sm" variant={variant} icon="Check" pending={pending && target === card.id} disabled={pending} onClick={() => approve([card.id], card.id)}>
        Approve
      </Button>
    ) : null;

  return (
    <Panel
      title="Waiting for your approval"
      meta={headline}
      flush={layout === "rows"}
      action={
        canApprove && cards.length > 1 ? (
          <Button size="sm" variant="primary" pending={pending && target === "all"} disabled={pending} onClick={() => approve(allIds, "all")}>
            {approveAllLabel(allIds.length)}
          </Button>
        ) : undefined
      }
      footer="Nothing goes out until you approve it."
    >
      {message === null ? null : (
        <Banner tone="neg" className={layout === "rows" ? "m-4" : "mb-4"}>
          {message}
        </Banner>
      )}
      {layout === "rows" ? (
        <ul>
          {cards.map((card) => (
            <li key={card.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <Picture card={card} className="size-10 shrink-0 rounded-control" />
              <div className="min-w-0 flex-1">
                <p className="truncate type-body font-medium text-ink">{card.title}</p>
                <p className="truncate type-meta">
                  {card.kind} · {card.when}
                </p>
              </div>
              <Button size="sm" onClick={() => setOpenId(card.id)}>
                Review
              </Button>
              {approveButton(card)}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-3 rounded-control border border-border p-3">
              <Picture card={card} className="aspect-4/3 w-full rounded-control" />
              <p className="type-body font-medium text-ink">{card.title}</p>
              {card.caption === null ? null : <p className="line-clamp-3 type-body text-ink-2">{card.caption}</p>}
              <p className="type-meta">
                {card.kind} · {card.when}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setOpenId(card.id)}>
                  Review
                </Button>
                {approveButton(card)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title={open?.title ?? "Review post"}
        description={open === null ? undefined : `${open.kind} · ${open.when}`}
        footer={
          open === null ? undefined : (
            <>
              {approveButton(open)}
              {canAsk ? <LinkButton href={open.changeHref}>Ask for a change</LinkButton> : null}
            </>
          )
        }
      >
        {open === null ? null : (
          <>
            <Picture card={open} className="aspect-4/3 w-full rounded-control" />
            {open.caption === null ? null : (
              <div>
                <p className="mb-1.5 type-label">Caption</p>
                <p className="rounded-control bg-neutral-wash p-3 type-body text-ink">{open.caption}</p>
              </div>
            )}
          </>
        )}
      </Sheet>
    </Panel>
  );
}
