"use client";

import { useState, useTransition } from "react";
import { Banner, Button } from "@/ui";
import { acceptInviteAction } from "../actions";

/** The one button of the accept page. The action refuses with a clear message, or goes Home when it works. */
export function AcceptInvite({ token }: { readonly token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      // A success redirects before it returns; only a refusal comes back here.
      if (!result.ok) setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
      <Button variant="primary" size="lg" pending={pending} onClick={accept}>
        Join the dashboard
      </Button>
    </div>
  );
}
