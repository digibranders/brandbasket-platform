"use client";

import { useState, useTransition } from "react";
import type { ActionFailure } from "@/lib/action-result";
import { Banner, Button, Dialog, DialogClose, useToast } from "@/ui";
import { sendRequestAction } from "../../requests/actions";

/*
 * Change payment method (overlays.js, payment). Gate G7: whether Razorpay can move a subscription to a new card or UPI without
 * a new mandate is not proven, so this is not self-serve. The dialog opens a billing request to the team through the Requests
 * feature (its rate limit, its submission key and its team alert), and the team sends a secure Razorpay link.
 */

/** What the team reads in the request. */
export const PAYMENT_METHOD_REQUEST = "Please send me a link to change the card or UPI my plan renews from.";

export function PaymentMethodRequest() {
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, start] = useTransition();
  // One key per opening of the dialog: a double press sends one request.
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const toast = useToast();

  const send = () => {
    const formData = new FormData();
    formData.set("intent", "billing");
    formData.set("body", PAYMENT_METHOD_REQUEST);
    formData.set("submissionKey", submissionKey);
    start(async () => {
      const result = await sendRequestAction(null, formData);
      if (!result.ok) {
        setFailure(result);
        return;
      }
      setFailure(null);
      setSubmissionKey(crypto.randomUUID());
      setOpen(false);
      toast("Request sent. We reply within one working day.");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button size="sm">Change</Button>}
      title="Change payment method"
      footer={
        <>
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button variant="primary" pending={pending} onClick={send}>
            Ask for a link
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        <p className="type-body text-ink-3">We send you a secure Razorpay link to add a new card or UPI. Your plan keeps running while you do.</p>
      </div>
    </Dialog>
  );
}
