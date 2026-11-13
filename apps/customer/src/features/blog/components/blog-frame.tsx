import type { ReactNode } from "react";
import { PageHeader } from "@/components";
import { websiteTabs } from "@/features/website/rules/paths";
import { Badge, TabLinks, type BadgeTone } from "@/ui";
import { BLOG_PATH, BLOG_TABS } from "../rules/paths";
import { PUBLISH_STATE_LABELS, type BlogPublishState } from "../rules/posts";

/**
 * The Website header with Blog as the current tab (as the mock shows it), then the blog's own three lists. The Pages tab
 * shows only when the website has pages, as on the other Website tabs.
 */
export function BlogFrame({ current, hasPages, actions, children }: { readonly current: string; readonly hasPages: boolean; readonly actions?: ReactNode; readonly children: ReactNode }) {
  return (
    <>
      <PageHeader title="Website" actions={actions} tabs={<TabLinks items={websiteTabs(hasPages)} current={BLOG_PATH} aria-label="Website" />} />
      <div className="mb-4">
        <TabLinks items={BLOG_TABS} current={current} aria-label="Blog" />
      </div>
      {children}
    </>
  );
}

const STATE_TONES: Readonly<Record<BlogPublishState, BadgeTone>> = { draft: "neutral", scheduled: "info", published: "pos" };

export function PublishStateBadge({ state }: { readonly state: BlogPublishState }) {
  return <Badge tone={STATE_TONES[state]}>{PUBLISH_STATE_LABELS[state]}</Badge>;
}
