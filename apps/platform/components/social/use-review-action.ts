"use client";

import { useState, useTransition } from "react";
import type { NewPostState } from "@/lib/social/new-post";

/**
 * Runs the customer's choices on the review page one at a time: while one is on its way the buttons are off, and what social-auto
 * refused is shown in the customer's own words. The page asks social-auto again by itself afterwards (the action revalidates it).
 */
export function useReviewAction(onNotice?: (message: string) => void): { readonly pending: boolean; readonly error: string | null; readonly notice: string | null; readonly run: (action: (form: FormData) => Promise<NewPostState>, fields: Readonly<Record<string, string>>, onDone?: () => void) => void } {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (action: (form: FormData) => Promise<NewPostState>, fields: Readonly<Record<string, string>>, onDone?: () => void): void => {
    if (pending) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        for (const [name, value] of Object.entries(fields)) form.set(name, value);
        const result = await action(form);
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        if (result.status === "partial") {
          setNotice(result.message);
          onNotice?.(result.message);
        }
        // Whatever the customer was doing (such as writing new words) is closed only when it went through, so a refusal keeps what she typed.
        onDone?.();
      } catch {
        setError("That did not work. Check your connection and try again.");
      }
    });
  };
  return { pending, error, notice, run };
}
