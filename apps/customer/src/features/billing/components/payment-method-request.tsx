"use client";

import { useState, useTransition } from "react";
import type { ActionFailure } from "@/lib/action-result";
import { Banner, Button, Dialog, DialogClose } from "@/ui";
import { changePaymentMethodAction } from "../actions";

/*
 * Change payment method. Self-serve flow through the provider (Razorpay hosted short_url flow).
 * The dialog explains the redirect to Razorpay and opens the provider hosted update page.
 */

export function PaymentMethodRequest() {
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, start] = useTransition();

  const handleUpdate = () => {
    start(async () => {
      const result = await changePaymentMethodAction();
      if (!result.ok) {
        setFailure(result);
        return;
      }
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
          <Button variant="primary" pending={pending} onClick={handleUpdate}>
            Change on Razorpay
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        <p className="type-body text-ink-3">
          You will be redirected to Razorpay to update your card or UPI details securely. Your plan keeps running while you do.
        </p>
      </div>
    </Dialog>
  );
}
