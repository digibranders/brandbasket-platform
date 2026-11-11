import { formatDate } from "@/lib/format";
import { Badge, type BadgeTone } from "@/ui";

/*
 * One word and one tone per status, the same on every screen and in email (plan 60, section 12). Screens map their data to
 * these keys and never pick a colour themselves.
 */

interface StatusWord {
  readonly word: string;
  readonly tone: BadgeTone;
}

export const STATUS_WORDS = {
  request: {
    sent: { word: "Sent", tone: "info" },
    quoted: { word: "Quoted", tone: "warn" },
    in_progress: { word: "In progress", tone: "info" },
    ready_to_check: { word: "Ready to check", tone: "accent" },
    done: { word: "Done", tone: "pos" },
    waiting_for_you: { word: "Waiting for you", tone: "warn" },
  },
  enquiry: {
    new: { word: "New", tone: "warn" },
    contacted: { word: "Contacted", tone: "info" },
    won: { word: "Won", tone: "pos" },
    lost: { word: "Lost", tone: "neutral" },
    counted: { word: "Counted", tone: "neutral" },
  },
  post: {
    planned: { word: "Planned", tone: "neutral" },
    needs_approval: { word: "Needs approval", tone: "warn" },
    approved: { word: "Approved", tone: "info" },
    published: { word: "Published", tone: "pos" },
  },
  website: {
    being_built: { word: "Being built", tone: "info" },
    preview_ready: { word: "Preview ready", tone: "accent" },
    changes_in_progress: { word: "Changes in progress", tone: "info" },
    approved: { word: "Approved", tone: "pos" },
    live: { word: "Live", tone: "pos" },
    on_hold: { word: "On hold", tone: "warn" },
  },
  service: {
    active: { word: "Active", tone: "pos" },
    in_setup: { word: "In setup", tone: "info" },
    ending: { word: "Ending", tone: "warn" },
  },
  invoice: {
    paid: { word: "Paid", tone: "pos" },
    failed: { word: "Failed", tone: "neg" },
    refunded: { word: "Refunded", tone: "neutral" },
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, StatusWord>>>>;

export type StatusKind = keyof typeof STATUS_WORDS;
export type StatusOf<K extends StatusKind> = keyof (typeof STATUS_WORDS)[K];

export type StatusBadgeProps =
  | { [K in Exclude<StatusKind, "service">]: { readonly kind: K; readonly status: StatusOf<K> } }[Exclude<StatusKind, "service">]
  | { readonly kind: "service"; readonly status: "active" | "in_setup" }
  /** A service on its way out says the date it ends: "Ending Tue 1 Dec". */
  | { readonly kind: "service"; readonly status: "ending"; readonly endsOn: Date };

function entryOf(props: StatusBadgeProps): StatusWord {
  const entry: StatusWord | undefined = (STATUS_WORDS[props.kind] as Readonly<Record<string, StatusWord>>)[props.status as string];
  if (entry === undefined) throw new RangeError(`No status word for ${props.kind} "${String(props.status)}".`);
  return entry;
}

/** The word a status is shown with, for places that need the text without the badge (a filter chip, an email). */
export function statusWord(props: StatusBadgeProps): string {
  const { word } = entryOf(props);
  return props.kind === "service" && props.status === "ending" ? `${word} ${formatDate(props.endsOn)}` : word;
}

export function StatusBadge(props: StatusBadgeProps) {
  return <Badge tone={entryOf(props).tone}>{statusWord(props)}</Badge>;
}
