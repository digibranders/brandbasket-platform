"use client";

import { CaretDown, X } from "@phosphor-icons/react/dist/ssr";
import type { CallReason } from "@brandbasket/db/call-reasons";
import { MAX_CALL_NOTE_LENGTH } from "@brandbasket/db/call-reasons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { bookCallAction } from "@/app/app-host/(protected)/requests/calls/actions";
import { SlotPicker, type PickerOutcome } from "@/components/calls/slot-picker";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";
import type { BookCallOptions } from "@/lib/calls/form";
import { defaultReasonOf } from "@/lib/calls/slot-view";

const INPUT =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-2/80 focus:border-ink";

const LINK_BUTTON = "text-[0.8125rem] font-semibold text-ink-2 underline underline-offset-[3px] transition-colors duration-200 hover:text-ink";

const LOOKS = { button: SOFT_BUTTON, primary: DARK_BUTTON, link: LINK_BUTTON } as const;

interface BookCallButtonProps extends BookCallOptions {
  /** The words on the button. */
  readonly label?: string;
  /** A soft button (the default), a plain link-looking button, or the screen's one dark button. */
  readonly look?: "button" | "link" | "primary";
  readonly defaultReason?: CallReason;
  readonly defaultNote?: string;
  /** Set when the customer is changing the time of a call: the new time replaces it. */
  readonly replacing?: { readonly id: string; readonly when: string } | null;
}

/** The "Book a call" side sheet and the button that opens it (plan 28 section 7): a day, a time and one Book button; what it is about and a note sit in a closed disclosure. */
export function BookCallButton({ options, bookingUrl, canBook, label = "Book a call", look = "button", defaultReason, defaultNote, replacing = null }: BookCallButtonProps): ReactElement {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CallReason | undefined>(defaultReasonOf(options, defaultReason));
  const [note, setNote] = useState(defaultNote ?? "");

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const book = async (slot: string): Promise<PickerOutcome> => {
    const result = await bookCallAction({ startIso: slot, timeZone: BRAND_TIME_ZONE, reason, note, replaceId: replacing?.id ?? null });
    if (result.ok) return { ok: true };
    return result.reason === "invalid" ? { ok: false, reason: "failed", message: result.message } : { ok: false, reason: result.reason };
  };

  const title = replacing === null ? "Book a call" : "Change your call";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={LOOKS[look]}>
        {label}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="book-call-title"
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(26rem,100%)] max-w-none overflow-y-auto overscroll-contain bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/30"
      >
        {open ? (
          <div className="grid min-h-full min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 px-5 pb-5">
            <header className="sticky top-0 z-10 -mb-1 flex items-center justify-between gap-3 bg-surface pb-1 pt-4">
              <h2 id="book-call-title" className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em]">
                {title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink-2 motion-safe:transition-colors motion-safe:duration-200 hover:text-ink"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <p className="text-[0.8125rem] text-ink-2">30 minutes on video. The link comes by email and in a calendar invite.</p>
            {replacing === null ? null : (
              <p className="text-sm text-ink-2">
                Your call is booked for <span className="font-semibold text-ink">{replacing.when}</span>. Pick a new time and it replaces this one.
              </p>
            )}
            {canBook ? (
              <SlotPicker
                bookingUrl={bookingUrl}
                book={book}
                onBooked={() => {
                  setOpen(false);
                  router.refresh();
                }}
                details={
                  <details className="group border-t border-line pt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-[0.8125rem] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rattan [&::-webkit-details-marker]:hidden">
                      <span>
                        What is it about? <span className="font-medium text-ink-2">(optional)</span>
                      </span>
                      <CaretDown size={16} aria-hidden="true" className="shrink-0 text-ink-2 motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 grid gap-4">
                      <fieldset className="min-w-0">
                        <legend className="sr-only">What is it about?</legend>
                        <div className="flex flex-wrap gap-1.5">
                          {options.map((option) => (
                            <label
                              key={option.value}
                              className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-sunken px-3 text-[0.8125rem] font-semibold text-ink motion-safe:transition-colors motion-safe:duration-200 has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-rattan"
                            >
                              <input type="radio" name="call-reason" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} className="sr-only" />
                              {option.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="call-note" className="block text-[0.8125rem] font-semibold text-ink">
                          Anything we should look at first? <span className="font-medium text-ink-2">(optional)</span>
                        </label>
                        <textarea id="call-note" rows={3} maxLength={MAX_CALL_NOTE_LENGTH} value={note} onChange={(event) => setNote(event.target.value)} className={INPUT} />
                      </div>
                    </div>
                  </details>
                }
              />
            ) : (
              <p className="text-sm text-ink-2">
                Add an email address in Settings to book here
                {bookingUrl === null ? "." : (
                  <>
                    , or{" "}
                    <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
                      pick a time on our booking page
                    </a>
                    .
                  </>
                )}
              </p>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
