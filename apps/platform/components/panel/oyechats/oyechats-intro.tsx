import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageSection } from "@/components/v2/page";

/** The aside both OyeChats pages carry: where to ask when the customer wants something about the chatbot changed. */
export function OyeChatsHelp(): ReactElement {
  return (
    <PageSection id="oyechats-help" title="Need something changed?">
      <div className="grid justify-items-start gap-3">
        <p className="text-sm leading-relaxed text-ink-2">The team looks after your chatbot for you.</p>
        <Link href="/requests/new" className={SOFT_BUTTON}>
          Ask the team
        </Link>
      </div>
    </PageSection>
  );
}

/** Said on both pages while the team has not added the customer's assistant yet: what happens, and the way to ask. */
export function NoAssistantYet(): ReactElement {
  return (
    <EmptyState
      icon={ChatCircleDots}
      title="Your chatbot is not set up yet"
      text="The team builds it for your business and adds it to your website. Then its status shows here, and visitors who leave their details appear as leads."
      action={
        <Link href="/requests/new" className={DARK_BUTTON}>
          Ask the team
        </Link>
      }
    />
  );
}
