import type { ReactElement } from "react";

const DETAIL_LABELS: Readonly<Record<string, string>> = {
  pageUrl: "Page", stepsToReproduce: "Steps to reproduce", expectedBehavior: "Expected behavior",
  actualBehavior: "What happened", browserDevice: "Browser", invoiceReference: "Invoice or payment reference",
  requestedChange: "Requested change", accountEmail: "Affected account email"
};

export interface SupportThreadEntry {
  readonly id: string; readonly body: string; readonly author: string; readonly internal: boolean; readonly at: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
  readonly attachments: readonly { readonly id: string; readonly filename: string }[];
}

export function SupportThread({ messages }: { readonly messages: readonly SupportThreadEntry[] }): ReactElement {
  return <ol aria-label="Conversation" className="divide-y divide-line">{messages.map((message) => <li key={message.id} className="py-6">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-sm font-semibold text-ink">{message.author}</span>{message.internal ? <span className="rounded-full bg-accent-pale px-2.5 py-1 text-xs text-accent-deep">Internal note</span> : null}<time dateTime={message.at} className="text-xs tabular-nums text-ink-soft">{new Date(message.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</time></div>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{message.body}</p>
    {message.details.length === 0 ? null : <dl className="mt-4 space-y-3">{message.details.map((detail) => <div key={detail.label}><dt className="text-xs font-medium text-ink-soft">{DETAIL_LABELS[detail.label] ?? detail.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{detail.value}</dd></div>)}</dl>}
    {message.attachments.length === 0 ? null : <ul aria-label="Screenshots" className="mt-4 flex flex-wrap gap-3">{message.attachments.map((attachment) => <li key={attachment.id}><a href={`/support-attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="link-underline text-sm text-ink">{attachment.filename}</a></li>)}</ul>}
  </li>)}</ol>;
}
