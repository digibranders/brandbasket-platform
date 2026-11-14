"use client";

import { useState } from "react";
import {
  ApprovalCard,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  NeedsYourOkList,
  NextActionCard,
  PageHeader as PatternPageHeader,
  PreviewFrame,
  PromptPopup,
  ServiceCard,
  SettingsTabs,
  Skeleton,
  StatTile,
  StatusChip,
  StatusTimeline,
  Stepper as PatternStepper,
  ThumbStrip,
} from "@brandbasket/shared/ui/patterns";

export function PatternsShowcase() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <section className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-card">
      <header className="border-b border-border pb-4">
        <span className="type-label text-accent-text">Release 2</span>
        <h2 className="type-section text-ink">Shared Pattern Components</h2>
        <p className="type-sub text-ink-2">
          Shared components from packages/shared/src/ui/patterns built to the premium design language.
        </p>
      </header>

      {/* 1. Status Chips */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">StatusChip</h3>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip label="Live" variant="active" hasDot />
          <StatusChip label="Next step" variant="next" />
          <StatusChip label="Waiting for you" variant="waiting" />
          <StatusChip label="Draft" variant="idle" />
          <StatusChip label="Failed" variant="failed" />
        </div>
      </div>

      {/* 2. Stat Tiles */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">StatTile</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Website visits" value="412" delta="+18%" deltaTone="positive" />
          <StatTile label="Posts published" value="18" />
          <StatTile label="Enquiries" value="9" delta="+2" deltaTone="positive" />
          <StatTile label="Calls completed" value="6" />
        </div>
      </div>

      {/* 3. Skeleton */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">Skeleton</h3>
        <div className="flex flex-col gap-3">
          <Skeleton height={28} width="40%" rounded="control" />
          <Skeleton height={80} rounded="card" />
        </div>
      </div>

      {/* 4. PageHeader */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">PageHeader</h3>
        <PatternPageHeader
          eyebrow="Services"
          title="Website"
          description="Your website sweetcrust.in is live on the internet."
          actions={
            <button type="button" className="inline-flex h-control-sm items-center rounded-control bg-ink px-4 font-sans text-xs font-semibold text-on-primary">
              Open preview
            </button>
          }
        />
      </div>

      {/* 5. Stepper & Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="type-label text-ink">Stepper</h3>
          <PatternStepper
            steps={[
              { id: "s1", label: "Kickoff call" },
              { id: "s2", label: "Design" },
              { id: "s3", label: "Preview" },
              { id: "s4", label: "Live" },
            ]}
            activeIndex={2}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="type-label text-ink">StatusTimeline</h3>
          <StatusTimeline
            entries={[
              { id: "e1", title: "Kickoff call completed", description: "Plan confirmed with staff.", timestamp: "17 Nov", state: "done" },
              { id: "e2", title: "Draft website ready", description: "Review your preview below.", state: "current" },
              { id: "e3", title: "Connect domain", description: "Point your A record.", state: "upcoming" },
            ]}
          />
        </div>
      </div>

      {/* 6. Focal Card (NextActionCard) */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">NextActionCard (Focal element)</h3>
        <NextActionCard
          serviceName="Website"
          serviceIcon={
            <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M9 20h6M12 16v4" />
            </svg>
          }
          serviceBadge="Active"
          title="Book your kickoff call"
          description="30 minutes on video. We go through your bakery and plan your website with you."
          primaryAction={{ label: "Book your kickoff call", onClick: () => {} }}
          asideNote="Times in India"
          statusText="Waiting for your kickoff call"
        />
      </div>

      {/* 7. ServiceCard */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">ServiceCard</h3>
        <ServiceCard
          serviceName="Social media"
          serviceIcon={
            <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <circle cx="6" cy="12" r="2.4" />
              <circle cx="18" cy="6" r="2.4" />
              <circle cx="18" cy="18" r="2.4" />
              <path d="m8.1 11 7.8-4M8.1 13l7.8 4" />
            </svg>
          }
          statusLabel="Running"
          statusVariant="active"
          summary="5 posts scheduled this week for Instagram and Facebook."
          action={
            <button type="button" className="type-button font-semibold text-ink underline decoration-accent-gold underline-offset-4">
              View schedule
            </button>
          }
        />
      </div>

      {/* 8. NeedsYourOkList */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">NeedsYourOkList</h3>
        <NeedsYourOkList
          items={[
            { id: "ok1", title: "Website preview", context: "1 round of changes left", age: "2d", onAction: () => {} },
            { id: "ok2", title: "3 pictures for next week", context: "Social media", onAction: () => {} },
            { id: "ok3", title: "Quote: Marathi page, Rs 1,500", context: "Requests", onAction: () => {} },
          ]}
        />
      </div>

      {/* 9. ApprovalCard */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">ApprovalCard</h3>
        <ApprovalCard
          title="Website preview draft"
          category="Website"
          description="Review the home and menu page layout before we connect your domain."
          revisionNote="1 round of changes left"
          onApprove={() => {}}
          onRequestChanges={() => {}}
        />
      </div>

      {/* 10. PreviewFrame */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">PreviewFrame (16:10)</h3>
        <PreviewFrame url="preview.sweetcrust.in" caption="Website preview for Sweet Crust Bakery">
          <div className="flex flex-col items-center gap-2">
            <h4 className="type-title text-ink">Sweet Crust Bakery</h4>
            <p className="max-w-reading type-body text-ink-2">Fresh sourdough and croissants baked daily in Pune.</p>
          </div>
        </PreviewFrame>
      </div>

      {/* 11. ThumbStrip */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">ThumbStrip (Social)</h3>
        <ThumbStrip
          items={[
            { id: "t1", title: "Morning Croissant", status: "Needs OK", statusVariant: "next", needsAction: true },
            { id: "t2", title: "Sourdough Loaf", status: "Needs OK", statusVariant: "next", needsAction: true },
            { id: "t3", title: "Chocolate Tart", status: "Scheduled", statusVariant: "active" },
          ]}
        />
      </div>

      {/* 12. SettingsTabs */}
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-ink">SettingsTabs</h3>
        <SettingsTabs
          tabs={[
            { id: "profile", label: "Profile" },
            { id: "security", label: "Security" },
            { id: "team", label: "Team", badge: 2 },
            { id: "delete", label: "Close account" },
          ]}
          activeTabId={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* 13. Empty & Error States */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <EmptyState
          title="Nothing needs your OK"
          description="Previews, post pictures and quotes will appear here."
        />
        <ErrorState
          title="Connection paused"
          message="Your Instagram login token expired. Reconnect to resume publishing."
          retryAction={{ label: "Reconnect", onClick: () => {} }}
        />
      </div>

      {/* 14. Dialogs */}
      <div className="flex flex-wrap gap-4 pt-4">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex h-control-sm items-center rounded-control bg-ink px-4 font-sans text-xs font-semibold text-on-primary"
        >
          Open ConfirmDialog demo
        </button>
        <button
          type="button"
          onClick={() => setPromptOpen(true)}
          className="inline-flex h-control-sm items-center rounded-control border border-border bg-surface px-4 font-sans text-xs font-semibold text-ink"
        >
          Open PromptPopup demo
        </button>

        <ConfirmDialog
          isOpen={confirmOpen}
          title="Close account?"
          consequence="You have 30 days to restore before your business data is permanently erased."
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          isDestructive
          confirmLabel="Close account"
        />

        <PromptPopup
          isOpen={promptOpen}
          title="Kickoff call confirmation"
          description="Sweet Crust Bakery video kickoff call."
          onClose={() => setPromptOpen(false)}
          primaryAction={{ label: "Call completed", onClick: () => setPromptOpen(false) }}
        >
          <div className="rounded-control border border-border bg-canvas p-4 type-body text-ink-2">
            Confirm staff held the video meeting. This begins the 5-day website build.
          </div>
        </PromptPopup>
      </div>
    </section>
  );
}
