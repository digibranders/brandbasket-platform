"use client";

import type { DnsRecord, DnsStatus } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { useActionState, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button, type BannerTone } from "@/ui";
import { checkDomainAction } from "../actions";
import type { DomainCheck } from "../dns-check";

/*
 * Ported from apps/platform components/panel/connect-domain-card.tsx. The main view keeps the check and its verdict; the
 * records and how to add them sit behind a disclosure (plan 61: no DNS terms in the main view).
 */

const VERDICTS: Readonly<Record<DnsStatus, { readonly tone: BannerTone; readonly text: string }>> = {
  connected: { tone: "pos", text: "Your domain is connected. We’ll take it from here and put your website live." },
  pending: { tone: "info", text: "Not there yet. Changes at your domain company can take anywhere from a few minutes to a few hours. Check again soon." },
  elsewhere: { tone: "warn", text: "Your domain still points somewhere else. Check the values match exactly, and remove any older record for the same name." },
};

const STATUS_LABEL: Readonly<Record<DnsStatus, string>> = { connected: "Connected", pending: "Not yet", elsewhere: "Points elsewhere" };

/** Puts text on the clipboard; the fallback covers pages without the async clipboard API (an insecure origin, an older browser). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(field);
    }
  }
}

function CopyButton({ value, label }: { readonly value: string; readonly label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="sm"
      icon={state === "copied" ? "Check" : "Copy"}
      aria-label={state === "failed" ? `Couldn’t copy ${label}` : `Copy ${label}`}
      onClick={() => {
        void copyText(value).then((ok) => {
          setState(ok ? "copied" : "failed");
          window.setTimeout(() => setState("idle"), 1800);
        });
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Try again" : "Copy"}</span>
    </Button>
  );
}

function RecordField({ label, value, copyLabel }: { readonly label: string; readonly value: string; readonly copyLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <dt className="w-16 type-meta">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 break-all type-mono text-ink">{value}</dd>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

export interface ConnectDomainProps {
  readonly hostname: string;
  readonly records: readonly DnsRecord[];
  /** A previous check already found it connected: said straight away instead of waiting for another press. */
  readonly alreadyConnected: boolean;
  /** "What to change at your domain company" while connecting, "DNS records we set up" once live. */
  readonly disclosure: string;
  /** Live: the records are kept for reference, so the disclosure starts closed and the check sits inside it. */
  readonly live: boolean;
  readonly emailUs: ReactNode;
}

/** The domain check, its verdict, and the records to add with a copy button on each value. */
export function ConnectDomain({ hostname, records, alreadyConnected, disclosure, live, emailUs }: ConnectDomainProps) {
  const [state, check, pending] = useActionState(async (): Promise<ActionResult<DomainCheck>> => checkDomainAction(), null);
  const result = state !== null && state.ok ? (state.data ?? null) : null;

  const checker = (
    <div className="flex flex-col gap-3">
      <form action={check}>
        <Button type="submit" variant={live ? "secondary" : "primary"} pending={pending}>
          Check my domain
        </Button>
      </form>
      <div aria-live="polite" className="flex flex-col gap-2">
        {state === null && alreadyConnected ? <Banner tone="pos">{VERDICTS.connected.text}</Banner> : null}
        {result === null ? null : (
          <>
            <Banner tone={VERDICTS[result.overall].tone}>{VERDICTS[result.overall].text}</Banner>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 type-meta">
              {result.records.map((record) => (
                <li key={record.host}>
                  <code className="type-mono text-ink">{record.host}</code>: {STATUS_LABEL[record.status]}
                </li>
              ))}
            </ul>
          </>
        )}
        {state !== null && !state.ok ? <Banner tone="neg">{state.message}</Banner> : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {live ? null : checker}
      <details className="rounded-control border border-border-subtle bg-surface-subtle p-3">
        <summary className="cursor-pointer type-sub text-ink">{disclosure}</summary>
        <div className="mt-3 flex flex-col gap-4">
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 type-body">
            <li>
              Sign in to the company you bought <strong className="font-semibold">{hostname}</strong> from, and open its DNS settings.
            </li>
            <li>Add {records.length === 1 ? "this record" : "these records"}. Leave everything else as it is, especially anything about email.</li>
            <li>Come back here and check. It can take a few minutes to a few hours.</li>
          </ol>
          <ul aria-label={`DNS records for ${hostname}`} className="m-0 flex list-none flex-col gap-4 p-0">
            {records.map((record) => (
              <li key={`${record.type}-${record.host}`} className="flex flex-col gap-2">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="type-sub text-ink">{record.type} record</span>
                  <span className="type-meta">{record.type === "CNAME" ? "Proxy: DNS only. TTL: Auto." : "TTL: Auto."}</span>
                </p>
                <dl className="m-0 flex flex-col gap-2">
                  <RecordField label="Name" value={record.host} copyLabel={`name for the ${record.type} record`} />
                  <RecordField label="Content" value={record.value} copyLabel={`content for the ${record.type} record`} />
                </dl>
              </li>
            ))}
          </ul>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 type-meta">
            <li>“Proxy status” only exists on Cloudflare: set it to DNS only (grey cloud). Leave TTL on Auto, or the lowest value you can.</li>
            <li>If your registrar already has a record for the same name, change it to these values rather than adding a second one.</li>
            <li>If your registrar won’t take @ as a host, leave it blank or type your domain.</li>
            <li>Once connected, your site may take a few more minutes to open securely.</li>
          </ul>
          {live ? checker : null}
        </div>
      </details>
      <p className="type-meta">Stuck? Tell us which company you bought it from and we’ll walk you through it: {emailUs}.</p>
    </div>
  );
}
