"use client";

import { useState, useTransition } from "react";
import type { ButtonProps } from "@/ui";
import { Banner, Button, useToast } from "@/ui";
import { revokeOtherSessionsAction } from "../actions";

/** Signs every device but this one out. The same button retries after a password change whose sign-out failed. */
export function SignOutOtherDevices({ label = "Sign out other devices", size = "md", onDone }: { readonly label?: string; readonly size?: ButtonProps["size"]; readonly onDone?: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      if (result.ok) {
        toast("Signed out of other devices");
        onDone?.();
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size={size} pending={pending} onClick={revoke}>
        {label}
      </Button>
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
    </div>
  );
}
