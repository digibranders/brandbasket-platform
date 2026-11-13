"use client";

import { useState, useTransition } from "react";
import { Banner, Button, useToast } from "@/ui";
import { revokeInviteAction } from "../actions";

/** Takes one invitation back. An expired invitation is revoked the same way, which lets the address be invited again. */
export function RevokeInviteButton({ inviteId, email }: { readonly inviteId: string; readonly email: string }) {
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeInviteAction(inviteId);
      if (result.ok) toast("Invitation revoked");
      else setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" pending={pending} onClick={revoke} aria-label={`Revoke the invitation to ${email}`}>
        Revoke
      </Button>
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
    </div>
  );
}
