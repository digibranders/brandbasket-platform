"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { Banner, Button, useToast } from "@/ui";
import { clearAnnouncementAction, saveAnnouncementAction } from "../actions";
import { ANNOUNCEMENT_MAX_LENGTH, announcementStatus, formSnapshot, type Announcement } from "../rules";
import { Section } from "./section";
import { TextField } from "./text-field";
import { useSectionForm } from "./use-section-form";

export interface AnnouncementSectionProps {
  readonly announcement: Announcement | null;
  /** Today where the business is (YYYY-MM-DD). */
  readonly today: string;
  /** What a fresh form starts with when nothing is saved yet: today, and two days out. */
  readonly defaultStartsOn: string;
  readonly defaultEndsOn: string;
  readonly readOnly: boolean;
}

/** A `YYYY-MM-DD` day as the app writes dates. Noon UTC is the same India calendar day, whatever the offset. */
export function dayLabel(day: string): string {
  return formatDate(new Date(`${day}T12:00:00Z`));
}

/** The one-line banner shown at the top of the business's website, and when it runs. Saved on its own; Remove takes it down. */
export function AnnouncementSection(props: AnnouncementSectionProps) {
  const { announcement, defaultStartsOn, defaultEndsOn } = props;
  const initial = {
    message: announcement?.message ?? "",
    startsOn: announcement?.startsOn ?? defaultStartsOn,
    endsOn: announcement?.endsOn ?? defaultEndsOn,
  };
  return <AnnouncementFields key={formSnapshot(Object.entries(initial))} initial={initial} {...props} />;
}

function statusText(announcement: Announcement, today: string): string {
  const status = announcementStatus(announcement, today);
  if (status.kind === "starts") return `Starts ${dayLabel(status.on)}`;
  if (status.kind === "ended") return "Ended";
  return `Showing until ${dayLabel(status.until)}`;
}

function AnnouncementFields({ announcement, today, readOnly, initial }: AnnouncementSectionProps & { readonly initial: Record<string, string> }) {
  const form = useSectionForm({ id: "business-announcement", initial, action: saveAnnouncementAction, saved: "Saved. Your website updates in about a minute." });
  const toast = useToast();
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);

  const remove = () => {
    setRemoveError(undefined);
    startRemoving(async () => {
      const result = await clearAnnouncementAction();
      if (result.ok) toast("Announcement removed");
      else setRemoveError(result.message);
    });
  };

  const message = form.values.message ?? "";
  return (
    <form id="business-announcement" onSubmit={form.submit} noValidate>
      {form.message === undefined ? null : <Banner tone="neg" className="m-4 mb-0">{form.message}</Banner>}
      <Section title="Announcement banner" where="Shown at the top of your website">
        {announcement === null ? null : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="type-sub">{statusText(announcement, today)}</p>
            {readOnly ? null : (
              <Button size="sm" pending={removing} onClick={remove}>
                Remove
              </Button>
            )}
          </div>
        )}
        {removeError === undefined ? null : <Banner tone="neg">{removeError}</Banner>}
        <TextField form={form} name="message" label="Message" readOnly={readOnly} maxLength={ANNOUNCEMENT_MAX_LENGTH} hint={`${message.length}/${ANNOUNCEMENT_MAX_LENGTH}`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="startsOn" label="Starts" readOnly={readOnly} type="date" />
          <TextField form={form} name="endsOn" label="Ends" readOnly={readOnly} type="date" />
        </div>
      </Section>
    </form>
  );
}
