"use client";

import type { CallReason } from "@brandbasket/db/call-reasons";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { Banner, Button, Dialog, DialogClose, Field, Select, Textarea, useToast } from "@/ui";
import { bookCallAction } from "../actions";
import { BOOK_PROBLEM_TEXT, bookButtonLabel, defaultReasonOf, type ReasonOption } from "../rules";
import { SlotChooser, useCallSlots } from "./slot-picker";

export interface BookCallDialogProps {
  /** The button that opens the dialog. */
  readonly trigger: ReactElement<Record<string, unknown>>;
  readonly options: readonly ReasonOption[];
  readonly bookingUrl: string | null;
  /** Changing a booked call: its id, and what it was about, so the form starts from them. */
  readonly replacing?: { readonly callId: string; readonly reason: CallReason | null; readonly note: string | null };
}

/** The dialog's body: loaded only while it is open, so the times are fresh each time it opens. */
function BookCallForm({ options, bookingUrl, replacing, onDone }: Omit<BookCallDialogProps, "trigger"> & { readonly onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { state, drop } = useCallSlots();
  const [reason, setReason] = useState<string | null>(defaultReasonOf(options, replacing?.reason ?? undefined) ?? null);
  const [note, setNote] = useState(replacing?.note ?? "");
  const [slot, setSlot] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ readonly message: string; readonly field?: string } | null>(null);
  const [pending, startBooking] = useTransition();
  const ready = "status" in state && state.status === "ok";

  const book = (): void => {
    if (slot === null) return;
    setProblem(null);
    startBooking(async () => {
      const result = await bookCallAction({ startIso: slot, timeZone: "Asia/Kolkata", reason, note, replaceId: replacing?.callId ?? null }).catch(() => ({
        ok: false as const,
        message: BOOK_PROBLEM_TEXT.failed,
        fieldErrors: undefined,
      }));
      if (result.ok) {
        toast("Call booked");
        onDone();
        router.refresh();
        return;
      }
      const field = result.fieldErrors === undefined ? undefined : Object.keys(result.fieldErrors)[0];
      setProblem(field === undefined ? { message: result.message } : { message: result.message, field });
      if (result.message === BOOK_PROBLEM_TEXT.taken) {
        drop(slot);
        setSlot(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="What is it about?" name="reason" {...(problem?.field === "reason" ? { error: problem.message } : {})}>
        <Select name="reason" options={options} value={reason} onValueChange={setReason} />
      </Field>
      <Field label="Anything we should look at first?" name="note" {...(problem?.field === "note" ? { error: problem.message } : {})}>
        <Textarea name="note" placeholder="Optional" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <SlotChooser state={state} slot={slot} onSlotChange={setSlot} bookingUrl={bookingUrl} />
      <p className="type-meta">30 minutes on video. The link comes by email and in a calendar invite.</p>
      {problem === null || problem.field !== undefined ? null : <Banner tone="neg">{problem.message}</Banner>}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose>
          <Button>Cancel</Button>
        </DialogClose>
        {ready ? (
          <Button variant="primary" disabled={slot === null} pending={pending} onClick={book}>
            {bookButtonLabel(slot, pending)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Book a call, or change a booked one (mock: overlays.js, dialog "book"). */
export function BookCallDialog({ trigger, options, bookingUrl, replacing }: BookCallDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog trigger={trigger} open={open} onOpenChange={setOpen} title={replacing === undefined ? "Book a call" : "Change your call"}>
      {open ? <BookCallForm options={options} bookingUrl={bookingUrl} {...(replacing === undefined ? {} : { replacing })} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  );
}
