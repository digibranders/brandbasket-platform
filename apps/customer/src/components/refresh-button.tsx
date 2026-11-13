"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/ui";

/** Try again for a panel whose loader failed: re-renders the page's server components, keeping what is on screen meanwhile. */
export function RefreshButton({ label = "Try again" }: { readonly label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" pending={pending} onClick={() => startTransition(() => router.refresh())}>
      {label}
    </Button>
  );
}
