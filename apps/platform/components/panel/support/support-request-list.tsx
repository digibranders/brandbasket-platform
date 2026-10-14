"use client";

import Link from "next/link";
import { useEffect, useState, useMemo, type ReactElement } from "react";
import { ArrowIcon, ChatIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import { SupportCategoryBadge, SupportStatusBadge } from "@fynix/shared/ui/panel/support-status-badge";
import { readMySupportRequests, type MySupportRequestItem } from "@/app/app-host/(support)/support/actions";
import { formatRelativeTime } from "./support-format";

type RequestPage = {
  readonly items: readonly MySupportRequestItem[];
  readonly nextCursor: string | null;
};

type FilterCategory = "all" | "active" | "resolved";

export function SupportRequestList({
  onSelectTicket,
  onCreateNew,
  onNavigate,
}: {
  readonly onSelectTicket: (ticketId: string) => void;
  readonly onCreateNew?: () => void;
  readonly onNavigate: (href: string) => void;
}): ReactElement {
  const [page, setPage] = useState<RequestPage | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterCategory>("all");

  useEffect(() => {
    let active = true;
    void readMySupportRequests()
      .then((result) => {
        if (active) {
          setPage(result);
          setError(result === null);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    if (!page) return [];
    if (filter === "active") {
      return page.items.filter((item) =>
        ["new", "triaged", "in_progress", "waiting_on_you"].includes(item.status),
      );
    }
    if (filter === "resolved") {
      return page.items.filter((item) =>
        ["resolved", "closed"].includes(item.status),
      );
    }
    return page.items;
  }, [page, filter]);

  const counts = useMemo(() => {
    if (!page) return { all: 0, active: 0, resolved: 0 };
    const active = page.items.filter((item) =>
      ["new", "triaged", "in_progress", "waiting_on_you"].includes(item.status),
    ).length;
    const resolved = page.items.filter((item) =>
      ["resolved", "closed"].includes(item.status),
    ).length;
    return { all: page.items.length, active, resolved };
  }, [page]);

  if (error) {
    return (
      <div className="py-8 text-center">
        <p role="alert" className="text-sm font-medium text-rose-600">
          Requests could not be loaded.
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Please close this window and try again.
        </p>
      </div>
    );
  }

  if (page === null) {
    return (
      <div className="py-12 text-center space-y-2">
        <div className="inline-block size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p role="status" className="text-xs text-ink-soft">Loading requests…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      {page.items.length > 0 ? (
        <div className="flex items-center gap-1.5 border-b border-line pb-3">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-ink text-paper"
                : "bg-paper-deep text-ink-soft hover:bg-line hover:text-ink"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              filter === "active"
                ? "bg-ink text-paper"
                : "bg-paper-deep text-ink-soft hover:bg-line hover:text-ink"
            }`}
          >
            Active ({counts.active})
          </button>
          <button
            type="button"
            onClick={() => setFilter("resolved")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              filter === "resolved"
                ? "bg-ink text-paper"
                : "bg-paper-deep text-ink-soft hover:bg-line hover:text-ink"
            }`}
          >
            Resolved ({counts.resolved})
          </button>
        </div>
      ) : null}

      {/* List or Empty State */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
            <ChatIcon className="size-6" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-ink">
              {page.items.length === 0 ? "No requests yet" : "No requests in this view"}
            </h4>
            <p className="mt-1 text-xs text-ink-soft max-w-sm mx-auto">
              {page.items.length === 0
                ? "When you ask a question or submit feedback, track its progress and staff replies right here."
                : "Switch to 'All' to see all your past support conversations."}
            </p>
          </div>
          {onCreateNew && page.items.length === 0 ? (
            <div className="pt-2">
              <Button type="button" size="sm" variant="secondary" onClick={onCreateNew} className="cursor-pointer">
                New request
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((ticket) => (
            <div
              key={ticket.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTicket(ticket.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTicket(ticket.id);
                }
              }}
              className="group flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4 transition-all duration-200 hover:border-accent/40 hover:bg-paper-deep/40 hover:shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SupportCategoryBadge category={ticket.category} />
                  <SupportStatusBadge status={ticket.status} size="sm" />
                </div>
                <time className="text-xs text-ink-muted">
                  {formatRelativeTime(ticket.createdAt)}
                </time>
              </div>

              <div className="flex items-start justify-between gap-3">
                <h4 className="font-semibold text-sm text-ink group-hover:text-accent-deep transition-colors line-clamp-2">
                  {ticket.subject}
                </h4>
                {ticket.unread ? (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-pale px-2 py-0.5 text-xs font-semibold text-accent-deep">
                    <span className="size-1.5 rounded-full bg-accent-deep animate-pulse" />
                    New reply
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between text-xs text-ink-soft pt-2 border-t border-line/60">
                <span className="font-mono text-ink-muted">{ticket.reference}</span>
                <span className="inline-flex items-center gap-1 font-medium text-ink-soft group-hover:text-ink transition-colors">
                  <span>View conversation</span>
                  <ArrowIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer link to full support page */}
      <div className="pt-3 border-t border-line flex items-center justify-between">
        <Link
          href="/support"
          onClick={(event) => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onNavigate("/support");
            }
          }}
          className="text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          View all requests in full page ↗
        </Link>
      </div>
    </div>
  );
}
