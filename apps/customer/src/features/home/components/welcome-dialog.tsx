"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, LinkButton } from "@/ui";

/** The address of the questions: they open where the customer left off. */
const QUESTIONS_HREF = "/start";

/** The parameter the payment confirmation adds to Home, and its one value. */
const WELCOME_PARAM = "welcome";
const WELCOME_VALUE = "1";

interface WelcomeDialogProps {
  /** The business has not finished the short questions: the dialog only exists to send them there. */
  readonly questionsOpen: boolean;
}

/**
 * Said once, on the visit right after the first payment (`/?welcome=1`) when the questions are still to do. Opens when it appears
 * and leads to the questions. Not now (or Close, or Escape) closes it and takes the parameter out of the address, so a reload does
 * not open it again. It is a modal, so the Book a call dialog on Home, which only a click opens, cannot be opened beneath it.
 */
export function WelcomeDialog({ questionsOpen }: WelcomeDialogProps) {
  const router = useRouter();
  const welcomed = useSearchParams().get(WELCOME_PARAM) === WELCOME_VALUE;
  const [open, setOpen] = useState(welcomed && questionsOpen);

  if (!welcomed || !questionsOpen) return null;
  const dismiss = (): void => {
    setOpen(false);
    router.replace("/");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      title="Payment received. Welcome to Brandbasket."
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          <LinkButton href={QUESTIONS_HREF} variant="primary">
            Answer a few questions
          </LinkButton>
        </>
      }
    >
      <p className="type-body text-ink-2">A few short questions help us build the right site for you.</p>
    </Dialog>
  );
}
