import type { AddOnEndOutcome } from "@brandbasket/shared/server/add-on-ends";

/**
 * What the client page's Add-ons section says after staff pause, cancel or follow up a purchase, or set a press release's
 * status (`?addOns=`). Fixed messages only: the address picks one by key, and nothing from it is ever shown. The row
 * itself carries the add-on name and the date, so the notice does not need to.
 */
export type AddOnNotice =
  | "cancel-scheduled"
  | "pause-scheduled"
  | "keep-undone-cancel"
  | "keep-undone-pause"
  | "unconfirmed"
  | "not-found"
  | "not-running"
  | "already-ending"
  | "provider-unavailable"
  | "changed-meanwhile"
  | "contacted"
  | "already-contacted"
  | "release-in-progress"
  | "release-published"
  | "release-unchanged";

export const ADD_ON_NOTICES: Readonly<Record<AddOnNotice, { readonly text: string; readonly ok: boolean }>> = {
  "cancel-scheduled": {
    text: "Cancel scheduled. It stops at the end of the month the customer has paid for, and they won’t be charged again.",
    ok: true,
  },
  "pause-scheduled": {
    text: "Pause scheduled. It pauses at the end of the month the customer has paid for, and they won’t be charged again unless they resume.",
    ok: true,
  },
  "keep-undone-cancel": {
    text: "The customer’s Keep it was undone. The add-on stops at the end of the month already paid for, and they won’t be charged again.",
    ok: true,
  },
  "keep-undone-pause": {
    text: "The customer’s Keep it was undone. The add-on pauses at the end of the month already paid for, and they won’t be charged again unless they resume.",
    ok: true,
  },
  unconfirmed: { text: "Nothing changed: tick the box to confirm you’ve told the customer.", ok: false },
  "not-found": { text: "Nothing changed: that add-on could not be found.", ok: false },
  "not-running": { text: "Nothing changed: that add-on isn’t running, so it can’t be paused or cancelled.", ok: false },
  "already-ending": { text: "Nothing changed: it is already set to stop or pause. The row shows the date.", ok: false },
  "provider-unavailable": {
    text: "Nothing changed: we couldn’t reach the payment provider. Try again in a minute.",
    ok: false,
  },
  "changed-meanwhile": {
    text: "Something changed while the add-on was being updated. Look at the row, then try again if it is still needed.",
    ok: false,
  },
  contacted: { text: "Marked as contacted. It no longer shows under Need you on the Journey.", ok: true },
  "already-contacted": { text: "Nothing changed: that purchase was already marked as contacted.", ok: false },
  "release-in-progress": { text: "Press release marked in progress.", ok: true },
  "release-published": { text: "Press release marked published.", ok: true },
  "release-unchanged": {
    text: "Nothing changed: that press release is already at this step or further on.",
    ok: false,
  },
};

/** `#add-ons` scrolls the reader to the Add-ons section, since the notice renders inside it. */
export function addOnNoticeHref(businessId: string, notice: AddOnNotice): string {
  return `/clients/${businessId}?addOns=${notice}#add-ons`;
}

export function readAddOnNotice(value: string | string[] | undefined): AddOnNotice | null {
  return typeof value === "string" && Object.hasOwn(ADD_ON_NOTICES, value) ? (value as AddOnNotice) : null;
}

/** The notice for what ending an add-on came to. The outcome's own dates and names are on the row, not in the notice. */
export function noticeForEndOutcome(outcome: AddOnEndOutcome): AddOnNotice {
  switch (outcome.kind) {
    case "scheduled":
      return outcome.endKind === "cancel" ? "cancel-scheduled" : "pause-scheduled";
    case "keep-undone":
      return outcome.endKind === "cancel" ? "keep-undone-cancel" : "keep-undone-pause";
    case "refused":
      return outcome.reason;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled add-on end outcome ${JSON.stringify(unhandled)}`);
    }
  }
}
