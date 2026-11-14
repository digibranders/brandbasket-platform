"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Banner, Button, Icon } from "@/ui";
import { cx } from "@/ui/cx";
import { AlertDialog } from "@/ui/alert-dialog";
import { ConnectButton } from "@/features/social/accounts/components/connect-button";
import { dayLabel, daysUntilEnd, endingSoon, endsInWords, PLATFORM_NAMES, type AutoChannel, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { ChannelLogo } from "@/legacy-social/components/channel-logo";
import { disconnectChannelAction, previewDisconnectAction } from "@/legacy-social/review-actions";
import type { ChannelPreview } from "@/legacy-social/server/social-auto";
import { CHANNEL_PLATFORMS } from "@/legacy-social/lib/social/auto";

function Row({ leading, title, text, action }: { readonly leading?: ReactNode; readonly title: ReactNode; readonly text: ReactNode; readonly action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-3 last:border-b-0">
      {leading === undefined ? null : <span className="grid size-9 shrink-0 place-items-center">{leading}</span>}
      <div className="min-w-60 flex-1">
        <p className="type-sub">{title}</p>
        <p className="type-meta">{text}</p>
      </div>
      {action}
    </div>
  );
}

/** A bare coloured icon holder that carries a duotone icon: the icons of the confirmation, so a line reads by its mark before its words. */
function Medal({ tone = "pos", size = "md", children }: { readonly tone?: "pos" | "info"; readonly size?: "md" | "lg"; readonly children: ReactNode }) {
  return <span className={cx("grid shrink-0 place-items-center", size === "lg" ? "size-10" : "size-7", tone === "pos" ? "text-pos-text" : "text-info-text")}>{children}</span>;
}

/** What the disconnect stops, shown as a number and the days it touches, so it is seen at a glance and not read. */
function Impact({ name, preview, loading }: { readonly name: string; readonly preview: ChannelPreview | null; readonly loading: boolean }) {
  if (loading) return <span className="type-meta">Checking what is scheduled…</span>;
  if (preview === null) return <span className="type-body text-ink">Posts will stop going out on {name}.</span>;
  if (preview.scheduled === 0) {
    return (
      <span className="flex items-center gap-3 rounded-control bg-surface-subtle p-3">
        <Medal size="lg">
          <Icon name="CalendarCheck" size="lg" duotone />
        </Medal>
        <span className="type-body text-ink">Nothing is scheduled on {name} right now.</span>
      </span>
    );
  }
  const shown = preview.days.slice(0, 6);
  const more = preview.days.length - shown.length;
  return (
    <span className="flex items-center gap-4 rounded-control bg-surface-subtle p-3">
      <span className="grid shrink-0 place-items-center">
        <span className="text-3xl font-bold font-mono leading-none text-warn-text">{preview.scheduled}</span>
        <span className="mt-0.5 text-xs font-semibold text-ink-2">{preview.scheduled === 1 ? "post" : "posts"}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="type-sub text-ink">will not go out on {name}</span>
        <span className="flex flex-wrap gap-1.5">
          {shown.map((day) => (
            <span key={day} className="rounded-badge bg-surface px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-border-control">
              {dayLabel(day, { weekday: "short", day: "numeric", month: "short" })}
            </span>
          ))}
          {more > 0 ? <span className="rounded-badge bg-surface px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-border-control-2">+{more} more</span> : null}
        </span>
      </span>
    </span>
  );
}

/** One connected account: its state in words, Reconnect when it needs it, and Disconnect with a confirmation that says what stops. */
function AccountRow({ channel, only, canChange, now }: { readonly channel: AutoChannel; readonly only: boolean; readonly canChange: boolean; readonly now: Date }) {
  const name = PLATFORM_NAMES[channel.platform];
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOnly, setConfirmOnly] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [loading, startLoading] = useTransition();
  const [pending, startDisconnect] = useTransition();
  const ending = endingSoon(channel, now);
  /** A connected account says nothing about it; one that needs attention says so in words, in colour only as a hint. */
  const attention = channel.paused === true ? "Paused" : ending ? endsInWords(daysUntilEnd(channel, now) ?? 0) : null;

  function ask(): void {
    setMessage(null);
    setConfirmOnly(false);
    setShowMeta(false);
    setOpen(true);
    startLoading(async () => {
      const result = await previewDisconnectAction(channel.id);
      if (result.ok) setPreview(result.preview);
      else setMessage(result.message);
    });
  }

  function confirm(): void {
    setMessage(null);
    startDisconnect(async () => {
      const form = new FormData();
      form.set("channelId", channel.id);
      if (confirmOnly) form.set("onlyChannel", "1");
      const result = await disconnectChannelAction(form);
      if (result.status === "error") setMessage(result.message);
      else setOpen(false);
    });
  }

  const running = preview !== null && preview.running.length > 0;
  /** Her only account: from the posting service when it says so, else from the list this page has. */
  const lastOne = only || preview?.onlyChannel === true;
  return (
    <Row
      leading={<ChannelLogo platform={channel.platform} medium />}
      title={name}
      text={
        <>
          {channel.account} · connected {dayLabel(channel.connectedAt.slice(0, 10), { day: "numeric", month: "short" })}
          {attention === null ? null : <span className="font-semibold text-warn"> · {attention}</span>}
        </>
      }
      action={
        canChange ? (
          <div className="flex flex-wrap gap-2">
            {ending ? <ConnectButton platform={channel.platform} size="sm">Reconnect</ConnectButton> : null}
            <AlertDialog
              open={open}
              onOpenChange={(next) => (next ? ask() : setOpen(false))}
              trigger={<Button size="sm" variant="danger">Disconnect</Button>}
              title={
                <span className="flex items-center gap-3">
                  <ChannelLogo platform={channel.platform} medium />
                  Disconnect {name}?
                </span>
              }
              description={
                <span className="flex flex-col gap-4">
                  <Impact name={name} preview={preview} loading={loading} />
                  {running ? <span className="font-semibold text-warn">Something is being written for {name} right now. Wait until it finishes, then disconnect.</span> : null}
                  <span className="flex flex-col gap-2 type-meta">
                    <span className="flex items-center gap-3">
                      <Medal>
                        <Icon name="ShieldCheck" size="md" duotone />
                      </Medal>
                      Your posts and pictures stay.
                    </span>
                    <span className="flex items-center gap-3">
                      <Medal tone="info">
                        <Icon name="ArrowsClockwise" size="md" duotone />
                      </Medal>
                      Connect the same account again before a post&rsquo;s time passes, and it goes out.
                    </span>
                  </span>
                  {channel.platform === "instagram" || channel.platform === "facebook" ? (
                    <span className="type-meta">
                      <button type="button" aria-expanded={showMeta} onClick={() => setShowMeta((open) => !open)} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-ink-2 underline decoration-dotted underline-offset-2">
                        Remove {name} access completely
                      </button>
                      {showMeta ? <span className="mt-1 block">Also remove the app in your Facebook settings: Settings, then Business integrations.</span> : null}
                    </span>
                  ) : null}
                  {lastOne ? (
                    <label className="flex items-start gap-2 rounded-control bg-surface-subtle p-3 text-ink">
                      <input type="checkbox" checked={confirmOnly} onChange={(event) => setConfirmOnly(event.target.checked)} className="mt-1" />
                      <span>This is your only connected account. Posts will stop going out until you connect another.</span>
                    </label>
                  ) : null}
                  {message === null ? null : <span role="alert" className="font-semibold text-error">{message}</span>}
                </span>
              }
              cancelLabel="Cancel"
              action={
                <Button variant="danger" disabled={loading || pending || running || (lastOne && !confirmOnly)} onClick={confirm}>
                  {pending ? "Disconnecting" : `Disconnect ${name}`}
                </Button>
              }
            />
          </div>
        ) : null
      }
    />
  );
}

export interface SocialSettingsViewProps {
  readonly brandName: string;
  readonly channels: readonly AutoChannel[];
  readonly unavailable: boolean;
  readonly canChange: boolean;
  /** Where "delete my social media data" goes (a message to us), since there is no form for it. */
  readonly deletionHref: string;
  readonly now?: Date;
}

/** Settings, Social media: the accounts posts go to, and how to ask for the data to be deleted. */
export function SocialSettingsView({ brandName, channels, unavailable, canChange, deletionHref, now = new Date() }: SocialSettingsViewProps) {
  const missing = CHANNEL_PLATFORMS.filter((platform): platform is ChannelPlatform => !channels.some((one) => one.platform === platform));

  return (
    <div className="flex flex-col gap-4">
      {unavailable ? <Banner tone="warn">We could not read your accounts just now. Try again in a few minutes. Nothing you did is lost.</Banner> : null}
      <section aria-labelledby="social-accounts" className="rounded-panel border border-border bg-surface shadow-card">
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 id="social-accounts" className="type-section">
            Connected accounts
          </h2>
          <p className="type-meta">The accounts posts for {brandName} go to. Disconnecting stops posts going to that account; your posts and pictures stay.</p>
        </div>
        {channels.length === 0 && !canChange ? <p className="px-4 py-3 type-meta">No account is connected yet.</p> : channels.map((channel) => <AccountRow key={channel.id} channel={channel} only={channels.length === 1} canChange={canChange} now={now} />)}
        {canChange
          ? missing.map((platform) => (
              <Row key={platform} leading={<ChannelLogo platform={platform} medium />} title={PLATFORM_NAMES[platform]} text={platform === "google" ? "Not connected. The Google account that manages your listing." : `Not connected. Connect your ${PLATFORM_NAMES[platform]} account to post there.`} action={<ConnectButton platform={platform} size="sm">{`Connect ${PLATFORM_NAMES[platform]}`}</ConnectButton>} />
            ))
          : null}
      </section>

      <section aria-labelledby="social-data" className="rounded-panel border border-border bg-surface shadow-card">
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 id="social-data" className="type-section">
            Your data
          </h2>
        </div>
        <Row
          title="Delete my social media data"
          text="Ask us to remove the saved logins, numbers and posts we hold for this business. Posts already published stay on the networks."
          action={
            <a href={deletionHref} className="inline-flex h-control-sm items-center rounded-control border border-border-control px-3 type-label no-underline hover:bg-neutral-wash">
              Ask us to delete
            </a>
          }
        />
      </section>
    </div>
  );
}
