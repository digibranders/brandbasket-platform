"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";
import { buttonSecondary } from "@/components/console/buttons";

/** Reads the page again after a read failed. Nothing is written. */
export function TryAgain({ label = "Try again" }: { readonly label?: string }): ReactElement {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => router.refresh())} className={buttonSecondary}>
      {pending ? "Checking" : label}
    </button>
  );
}
