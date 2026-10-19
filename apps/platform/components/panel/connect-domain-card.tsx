"use client";

import { useActionState, useState, type ReactElement, type ReactNode } from "react";
import { CopyIcon, TickIcon } from "@brandbasket/shared/ui/icons";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import type { DnsRecord, DnsStatus } from "@brandbasket/shared/lib/onboarding/domain-dns";
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
  connected: { tone: "bg-paper-deep text-ink", text: "Your domain is connected. We’ll take it from here and put your website live." },
  pending: { tone: "bg-paper-deep text-ink", text: "Not there yet. Changes at your domain company can take anywhere from a few minutes to a few hours. Check again soon." },
  elsewhere: { tone: "bg-accent-pale text-accent-deep", text: "Your domain still points somewhere else. Check the values above match exactly, and remove any older record for the same name." },
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
      title={state === "copied" ? "Copied" : state === "failed" ? "Couldn’t copy" : "Copy"}
      onClick={() => {
        void copyText(value).then((ok) => {
          setState(ok ? "copied" : "failed");
          window.setTimeout(() => setState("idle"), 1800);
        });
      }}
      className={`shrink-0 rounded-control p-1 transition-colors duration-300 ease-calm hover:text-ink ${state === "failed" ? "text-accent-deep" : state === "copied" ? "text-success" : "text-ink-soft"}`}
    >
      {state === "copied" ? <TickIcon className="size-4" /> : <CopyIcon className="size-4" />}
    </button>
  );
}

/** A value that can be copied: the text in a code chip with a copy icon beside it. */
function CopyCell({ value, label }: { readonly value: string; readonly label: string }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      <code className="rounded-control bg-paper-deep px-2 py-1 text-sm text-ink">{value}</code>
      <CopyButton value={value} label={label} />
    </span>
  );
}

/**
 * What a customer with their own domain does once their website is approved: the two settings to change at the company
 * they bought it from, shown with copy buttons, and a button that looks up their DNS and says how far it has got.
 * The records come from the domain stored for the business; the check reads nothing from this form.
 */
export function ConnectDomainCard({ hostname, records, checkAction, emailUs, alreadyConnected }: ConnectDomainCardProps): ReactElement {
  const [state, formAction] = useActionState(checkAction, initialConnectDomainState);

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-soft">
        Sign in to your domain registrar, the company you bought <span className="font-medium text-ink">{hostname}</span> from, and
        open its DNS settings. Add {records.length === 1 ? "this record" : "these records"}. Leave everything else as it is,
        especially anything about email.
      </p>

      <div className="overflow-x-auto rounded-control border border-line">
        <table className="w-full border-collapse whitespace-nowrap text-left text-sm">
          <caption className="sr-only">DNS records to add for {hostname}</caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th scope="col" className="px-2 py-2 font-medium">Type</th>
              <th scope="col" className="px-2 py-2 font-medium">Name</th>
              <th scope="col" className="px-2 py-2 font-medium">Content</th>
              <th scope="col" className="px-2 py-2 font-medium">Proxy</th>
              <th scope="col" className="px-2 py-2 font-medium">TTL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {records.map((record) => {
              return (
                <tr key={`${record.type}-${record.host}`}>
                  <td className="px-2 py-3 font-medium">{record.type}</td>
                  <td className="px-2 py-3">
                    <CopyCell value={record.host} label={`name for the ${record.type} record`} />
                  </td>
                  <td className="px-2 py-3">
                    <CopyCell value={record.value} label={`content for the ${record.type} record`} />
                  </td>
                  <td className="px-2 py-3 text-ink-soft">DNS only</td>
                  <td className="px-2 py-3 text-ink-soft">Auto</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">
        Same as in your registrar’s DNS table. “Proxy status” only exists on Cloudflare: set it to DNS only (grey cloud). Leave TTL on Auto, or the lowest value you can.
      </p>

      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
        <li>If your registrar already has a record for the same name, change it to these values rather than adding a second one.</li>
        <li>If your registrar won’t take <code className="text-ink">@</code> as a host, leave it blank or type your domain.</li>
        <li>Changes can take a few minutes to a few hours. Once connected, your site may take a few more minutes to open securely.</li>
        <li>If your domain already shows a website, it switches to your new one as soon as this takes effect.</li>
      </ul>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Checking…">
          Check my domain
        </SubmitButton>
      </form>

      <div aria-live="polite">
        {state.status === "idle" && alreadyConnected ? (
          <p role="status" className={`rounded-control px-4 py-3 text-sm ${VERDICTS.connected.tone}`}>
            {VERDICTS.connected.text}
          </p>
        ) : null}
        {state.status === "checked" ? (
          <p role="status" className={`rounded-control px-4 py-3 text-sm ${VERDICTS[state.overall].tone}`}>
            {VERDICTS[state.overall].text}
          </p>
        ) : null}
        {state.status === "checked" ? (
          <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
            {state.records.map((record) => (
              <li key={record.host}>
                <code>{record.host}</code>: {STATUS_LABEL[record.status]}
              </li>
            ))}
          </ul>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            {state.message}
          </p>
        ) : null}
      </div>

      <p className="text-sm text-ink-soft">
        Stuck? Tell us which company you bought it from and we’ll walk you through it: {emailUs}.
      </p>
    </div>
  );
}
