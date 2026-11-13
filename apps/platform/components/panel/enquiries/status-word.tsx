import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { RowStatus } from "@/lib/enquiries/rules";

const WORDS: Readonly<Record<RowStatus, { readonly word: string; readonly classes: string }>> = {
  new: { word: "New", classes: "bg-warn-wash text-warn" },
  contacted: { word: "Contacted", classes: "bg-info-wash text-info" },
  won: { word: "Won", classes: "bg-ok-wash text-ok" },
  lost: { word: "Lost", classes: "bg-sunken text-ink-2" },
  counted: { word: "Counted", classes: "bg-sunken text-ink-2" },
};

/** An enquiry's status as a word on a soft fill: the word always says it, the colour only helps. */
export function StatusWord({ status }: { readonly status: RowStatus }): ReactElement {
  const { word, classes } = WORDS[status];
  return <span className={cn("inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[0.8125rem] font-semibold", classes)}>{word}</span>;
}
