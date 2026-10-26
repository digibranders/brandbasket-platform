"use client";

import type { ReactElement } from "react";
import type { DirectoryPaidTag } from "@brandbasket/db";
import {
  PROMOTION_DAYS,
  PROMOTION_TAGS,
  PROMOTION_TAG_LABELS,
} from "@brandbasket/shared/lib/directory/promotion";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

/** Written as escapes to keep the source plain text. */
const DOT_SEPARATOR = " · ";
const ELLIPSIS = "…";
const EM_DASH = "—";

/** The week's price, already formatted, GST included: "₹299", with "₹45.74" of it GST at "18%". `net` is what is left after the GST. */
export interface PromotionPrice {
  readonly net: string;
  readonly tax: string;
  readonly total: string;
  /** "18%". */
  readonly taxRate: string;
}

/** The running tag, already worked out and formatted for display. */
export interface RunningPromotion {
  readonly tag: DirectoryPaidTag;
  /** When the last paid week ends, e.g. "6 Oct". */
  readonly until: string;
  readonly daysLeft: number;
  /** When a renewal is booked: the day the running week ends and the booked one takes over, e.g. "6 Oct". */
  readonly renewedFrom: string | null;
  readonly visible: boolean;
  readonly remind: boolean;
  readonly canRenew: boolean;
}

interface ListingPromotionProps {
  readonly running: RunningPromotion | null;
  /** The tag an unpaid promotion charge is for, preselected so starting again picks up where they left off. */
  readonly pendingTag: DirectoryPaidTag | null;
  readonly price: PromotionPrice;
  /** Every change needs a paid plan: an unpaid business sees where its tag stands without the controls. */
  readonly editable: boolean;
  /** A refusal from the last Pay press (`?promotion=`), or null. */
  readonly notice: string | null;
  readonly actions: {
    /** A form action that redirects to payment. */
    readonly pay: (formData: FormData) => Promise<void>;
    readonly visible: PanelFormAction;
  };
}

const MUTED = "text-ink-soft";
const NOTICE = "rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep";

function daysLeftText(days: number): string {
  return days === 1 ? "1 day left" : `${days} days left`;
}

/** Shows or hides the running tag. The paid week keeps running either way. */
function VisibleSwitch({
  visible,
  editable,
  action,
}: {
  readonly visible: boolean;
  readonly editable: boolean;
  readonly action: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center justify-end gap-3">
      <input type="hidden" name="visible" value={visible ? "off" : "on"} />
      <PanelFormStatus controls={controls} statusRef={statusRef} />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!editable || controls.isPending}
        aria-busy={controls.isPending}
        aria-label={visible ? "Hide the tag on the directory" : "Show the tag on the directory"}
      >
        {visible ? "Hide" : "Show"}
      </Button>
    </form>
  );
}

function PriceBreakdown({ price }: { readonly price: PromotionPrice }): ReactElement {
  return (
    <p className="text-sm text-ink-soft">
      <span className="tabular-nums">
        {price.total}, with {price.tax} GST ({price.taxRate}) inside
      </span>
      {DOT_SEPARATOR}
      {PROMOTION_DAYS} days, no auto-renew
    </p>
  );
}

/** The running tag: what it reads, until when, the on/off switch, and Renew while no next week is booked. */
function RunningTag({
  running,
  price,
  editable,
  actions,
}: {
  readonly running: RunningPromotion;
  readonly price: PromotionPrice;
  readonly editable: boolean;
  readonly actions: ListingPromotionProps["actions"];
}): ReactElement {
  const label = PROMOTION_TAG_LABELS[running.tag];
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="font-serif text-xl leading-snug">
          {label} <span className={MUTED}>{`${EM_DASH} until ${running.until}`}</span>
        </p>
        <p className="text-sm text-ink-soft">
          {daysLeftText(running.daysLeft)}
          {running.renewedFrom === null ? null : `${DOT_SEPARATOR}next week paid, from ${running.renewedFrom}`}
        </p>
      </div>

      {running.remind ? (
        <p role="status" className={NOTICE}>
          Your tag ends on {running.until}. Renew now to keep it for another week; nothing renews on its own.
        </p>
      ) : null}

      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-x-4 border-y border-line py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
        <span className="text-sm font-semibold text-ink-soft">On directory</span>
        <span className="text-sm">{running.visible ? "Shown" : <span className={MUTED}>Hidden, still paid for</span>}</span>
        <VisibleSwitch visible={running.visible} editable={editable} action={actions.visible} />
      </div>

      {editable && running.canRenew ? (
        <form action={actions.pay} className="space-y-3">
          <input type="hidden" name="tag" value={running.tag} />
          <SubmitButton size="sm" pendingLabel={`Opening${ELLIPSIS}`}>
            Renew for another week{DOT_SEPARATOR}
            <span className="tabular-nums">{price.total}</span>
          </SubmitButton>
          <PriceBreakdown price={price} />
        </form>
      ) : null}
    </div>
  );
}

/** Choosing a tag and paying for its first week. */
function ChooseTag({
  pendingTag,
  price,
  pay,
}: {
  readonly pendingTag: DirectoryPaidTag | null;
  readonly price: PromotionPrice;
  readonly pay: ListingPromotionProps["actions"]["pay"];
}): ReactElement {
  const initial = pendingTag ?? PROMOTION_TAGS[0]?.id;
  return (
    <form action={pay} className="space-y-5">
      <fieldset>
        <legend className="text-sm text-ink-soft">
          Put a tag on your listing for a week. <RequiredMark />
        </legend>
        <ul className="mt-3">
          {PROMOTION_TAGS.map((option) => (
            <li key={option.id} className="border-b border-line">
              <label className="flex cursor-pointer items-start gap-3 py-3">
                <input
                  type="radio"
                  name="tag"
                  value={option.id}
                  defaultChecked={option.id === initial}
                  required
                  className="mt-1 size-4 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="block text-sm text-ink-soft">{option.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="space-y-2">
        <SubmitButton size="sm" pendingLabel={`Opening${ELLIPSIS}`}>
          Pay <span className="tabular-nums">{price.total}</span> for {PROMOTION_DAYS} days
        </SubmitButton>
        <PriceBreakdown price={price} />
      </div>
    </form>
  );
}

/**
 * The Listing page's Promotion section: a paid tag ("Hot & New · Ad") for a week at a time. Paying goes through the
 * ordinary charge payment; the week starts once the payment is confirmed, and this section then shows it with its
 * on/off switch, Renew, and a reminder in its last two days.
 */
export function ListingPromotion({
  running,
  pendingTag,
  price,
  editable,
  notice,
  actions,
}: ListingPromotionProps): ReactElement {
  return (
    <div className="space-y-5">
      {notice === null ? null : (
        <p role="status" className={NOTICE}>
          {notice}
        </p>
      )}
      {running !== null ? (
        <RunningTag running={running} price={price} editable={editable} actions={actions} />
      ) : editable ? (
        <ChooseTag pendingTag={pendingTag} price={price} pay={actions.pay} />
      ) : (
        <p className="text-sm text-ink-soft">Tags open once your plan is paid.</p>
      )}
    </div>
  );
}
