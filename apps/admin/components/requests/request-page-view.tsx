"use client";

import { ToastRegion, useShortcuts } from "@brandbasket/shared/ui/patterns";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import { buttonPrimary } from "@/components/console/buttons";
import type { RequestDetail } from "@/lib/server/requests-view";
import { ComposerActions, ConversationBody, useRequestComposer } from "./request-conversation";

/** The same conversation as the side panel, as a page: for a phone, a direct link and the console's other screens. */
export function RequestPageView({ detail, children }: { readonly detail: RequestDetail; readonly children?: ReactNode }): ReactElement {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const composer = useRequestComposer(detail, refresh);
  const shortcuts = useMemo(() => [{ id: "request-reply", keys: "r", label: "Reply to this request", group: "Lists" as const, run: composer.focusReply }], [composer.focusReply]);
  useShortcuts(shortcuts);
  return (
    <div className="grid max-w-3xl gap-4">
      <ConversationBody detail={detail} composer={composer}>
        {children}
      </ConversationBody>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonPrimary} disabled={composer.busy || composer.replyDisabledReason !== undefined} title={composer.replyDisabledReason} onClick={composer.sendReply}>
          {composer.replyLabel}
        </button>
        <ComposerActions composer={composer} />
      </div>
      <ToastRegion />
    </div>
  );
}
