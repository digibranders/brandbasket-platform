"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/ui";
import { unlockPostsAction } from "../actions";

/**
 * At the post limit: opens the payment for the next block (the action redirects to it). Only ever on a press; the price is
 * stated in the list's footer line.
 */
export function UnlockPostsButton() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" pending={pending} onClick={() => startTransition(async () => setResult(await unlockPostsAction()))}>
        Unlock more posts
      </Button>
      {result === null || result.ok ? null : (
        <p role="alert" className="type-meta text-neg-text">
          {result.message}
        </p>
      )}
    </div>
  );
}
