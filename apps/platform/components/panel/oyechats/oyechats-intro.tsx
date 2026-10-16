import Link from "next/link";
import type { ReactElement } from "react";
import { OYECHATS_INCLUDED_LABEL } from "@/lib/chatbots-view";

/** What heads each OyeChats page: that it comes with the plan, and one line saying where to ask for a change. */
export function OyeChatsIntro(): ReactElement {
  return (
    <>
      <p className="mt-3 inline-flex items-center rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">{OYECHATS_INCLUDED_LABEL}</p>
      <p className="mt-4 text-ink-soft">
        Need something changed? <Link href="/support" className="link-underline text-ink">Ask the team</Link>.
      </p>
    </>
  );
}

/** Said on both pages while the team has not added the customer's assistant yet. */
export function NoAssistantYet(): ReactElement {
  return (
    <p role="status" className="mt-8 max-w-2xl rounded-control bg-paper-deep px-4 py-3 text-sm text-ink">
      Your OyeChats assistant is not set up yet. The team adds it here as soon as it is ready, and you will see its status and your leads on this page.
    </p>
  );
}
