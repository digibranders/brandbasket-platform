"use client";

import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { useActionState, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import type { DnsRecord, DnsStatus } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { DARK_BUTTON_SHAPE, SOFT_BUTTON } from "@/components/v2/classes";
import { initialConnectDomainState, type ConnectDomainState } from "@/lib/connect-domain-state";

interface ConnectDomainCardProps {
  readonly hostname: string;
  readonly records: readonly DnsRecord[];
  readonly checkAction: (previous: ConnectDomainState, formData: FormData) => Promise<ConnectDomainState>;
  /** The "email us" link, rendered by the page: it reads the request, so it cannot be imported into this client component. */
  readonly emailUs: ReactNode;
  /** The team has already found it connected (a previous check): shown straight away instead of waiting for another press. */
  readonly alreadyConnected: boolean;
}

const VERDICTS: Readonly<Record<DnsStatus, { readonly tone: string; readonly text: string }>> = {
  connected: { tone: "bg-sage-wash text-sage-deep", text: "Your domain is connected. We’ll take it from here and put your website live." },
  pending: { tone: "bg-sunken text-ink", text: "Not there yet. Changes at your domain company can take anywhere from a few minutes to a few hours. Check again soon." },
  elsewhere: { tone: "bg-rattan-wash text-rattan-ink", text: "Your domain still points somewhere else. Check the values above match exactly, and remove any older record for the same name." },
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

function CopyButton({ value, label }: { readonly value: string; readonly label: string }): ReactElement {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={state === "failed" ? `Couldn’t copy ${label}` : `Copy ${label}`}
      onClick={() => {
        void copyText(value).then((ok) => {
          setState(ok ? "copied" : "failed");
          window.setTimeout(() => setState("idle"), 1800);
        });
      }}
      className={cn(SOFT_BUTTON, "h-8 w-[5.25rem] shrink-0")}
    >
      {state === "copied" ? <Check size={14} weight="bold" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Try again" : "Copy"}</span>
    </button>
  );
}

/** One field of a record: its label, the value to type in, and a button that copies it. */
function RecordField({ label, value, copyLabel }: { readonly label: string; readonly value: string; readonly copyLabel: string }): ReactElement {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto]">
      <dt className="col-span-2 text-[0.8125rem] text-ink-2 sm:col-span-1">{label}</dt>
      <dd className="min-w-0 break-all font-figure text-sm text-ink">{value}</dd>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

/** One DNS record to add: its type, then the name and the content, each with its own copy button. */
function RecordRow({ record }: { readonly record: DnsRecord }): ReactElement {
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{record.type} record</span>
        <span className="text-xs text-ink-2">{record.type === "CNAME" ? "Proxy: DNS only. TTL: Auto." : "TTL: Auto."}</span>
      </p>
      <dl className="grid gap-2.5">
        <RecordField label="Name" value={record.host} copyLabel={`name for the ${record.type} record`} />
        <RecordField label="Content" value={record.value} copyLabel={`content for the ${record.type} record`} />
      </dl>
    </li>
  );
}

/** A numbered instruction: the number in a small mark, the words beside it, and anything that belongs to it under them. */
function Instruction({ number, title, children }: { readonly number: number; readonly title: ReactNode; readonly children?: ReactNode }): ReactElement {
  return (
    <li className="grid grid-cols-[1.625rem_minmax(0,1fr)] gap-3">
      <span aria-hidden="true" className="grid size-[1.625rem] place-items-center rounded-full bg-sunken text-[0.8125rem] tabular-nums text-ink">
        {number}
      </span>
      <div className="min-w-0">
        <p className="pt-0.5 text-sm leading-relaxed text-ink">{title}</p>
        {children === undefined ? null : <div className="mt-4">{children}</div>}
      </div>
    </li>
  );
}

/**
 * What a customer with their own domain does once their website is approved: three things to do at the company they bought
 * it from, the records to add with a copy button on each value, and a button that looks up their DNS and says how far it has
 * got. The records come from the domain stored for the business; the check reads nothing from this form.
 */
export function ConnectDomainCard({ hostname, records, checkAction, emailUs, alreadyConnected }: ConnectDomainCardProps): ReactElement {
  const [state, formAction] = useActionState(checkAction, initialConnectDomainState);

  return (
    <div className="grid gap-5">
      <ol className="grid gap-6">
        <Instruction
          number={1}
          title={
            <>
              Sign in to your domain registrar, the company you bought <span className="font-semibold">{hostname}</span> from, and open its DNS settings.
            </>
          }
        />
        <Instruction number={2} title={<>Add {records.length === 1 ? "this record" : "these records"}. Leave everything else as it is, especially anything about email.</>}>
          <ul aria-label={`DNS records to add for ${hostname}`} className="divide-y divide-line">
            {records.map((record) => (
              <RecordRow key={`${record.type}-${record.host}`} record={record} />
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-2">“Proxy status” only exists on Cloudflare: set it to DNS only (grey cloud). Leave TTL on Auto, or the lowest value you can.</p>
        </Instruction>
        <Instruction number={3} title="Come back here and check. It can take a few minutes to a few hours.">
          <form action={formAction}>
            <SubmitButton pendingLabel="Checking…" className={DARK_BUTTON_SHAPE}>
              Check my domain
            </SubmitButton>
          </form>
        </Instruction>
      </ol>

      <div aria-live="polite" className="grid gap-2">
        {state.status === "idle" && alreadyConnected ? (
          <p role="status" className={cn("rounded-lg px-4 py-3 text-sm", VERDICTS.connected.tone)}>
            {VERDICTS.connected.text}
          </p>
        ) : null}
        {state.status === "checked" ? (
          <>
            <p role="status" className={cn("rounded-lg px-4 py-3 text-sm", VERDICTS[state.overall].tone)}>
              {VERDICTS[state.overall].text}
            </p>
            <ul className="grid gap-0.5 text-xs text-ink-2">
              {state.records.map((record) => (
                <li key={record.host}>
                  <code className="font-figure text-ink">{record.host}</code>: {STATUS_LABEL[record.status]}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="rounded-lg bg-rattan-wash px-4 py-3 text-sm text-rattan-ink">
            {state.message}
          </p>
        ) : null}
      </div>

      <p className="text-[0.8125rem] text-ink-2">Stuck? Tell us which company you bought it from and we’ll walk you through it: {emailUs}.</p>
    </div>
  );
}
