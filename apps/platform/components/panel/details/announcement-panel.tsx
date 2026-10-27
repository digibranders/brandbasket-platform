"use client";

import { useEffect, useState, type ReactElement } from "react";
import { ANNOUNCEMENT_MAX_LENGTH, type Announcement } from "@brandbasket/shared/lib/business-facts/announcement";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { MAX_DATE, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { DETAILS_FIELD, DETAILS_LABEL } from "./field-classes";
import { SaveButton } from "./save-button";

interface AnnouncementPanelProps {
  readonly announcement: Announcement | null;
  /** Today's date where the business is (YYYY-MM-DD), for deciding which status line to show. */
  readonly today: string;
  /** What a fresh form starts with when nothing is saved yet: today, and two days out. */
  readonly defaultStartsOn: string;
  readonly defaultEndsOn: string;
  readonly saveAction: PanelFormAction;
  readonly clearAction: PanelFormAction;
}

/** "Showing until 3 October 2026", "Starts 1 October 2026" for one that hasn't started, or "Ended" for one whose
 * last day has passed but hasn't been removed yet. */
function announcementStatus(announcement: Announcement, today: string): string {
  if (today < announcement.startsOn) return `Starts ${formatStoredDate(announcement.startsOn)}`;
  if (today > announcement.endsOn) return "Ended";
  return `Showing until ${formatStoredDate(announcement.endsOn)}`;
}

function RemoveForm({
  clearAction,
  onRemoved,
}: {
  readonly clearAction: PanelFormAction;
  /** Called once the removal goes through, so the panel above can clear the message field it's no longer showing. */
  readonly onRemoved: () => void;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(clearAction);

  useEffect(() => {
    if (controls.saved) onRemoved();
    // Only the transition into "saved" matters here; onRemoved is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.saved]);

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-3">
      <button type="submit" className={`${SOFT_BUTTON} disabled:opacity-55`} disabled={controls.isPending} aria-busy={controls.isPending}>
        {controls.isPending ? "Removing…" : "Remove"}
      </button>
      <PanelFormStatus controls={controls} statusRef={statusRef} />
    </form>
  );
}

/** The one-line banner shown on the business's own site, plus when it runs. */
export function AnnouncementPanel({
  announcement,
  today,
  defaultStartsOn,
  defaultEndsOn,
  saveAction,
  clearAction,
}: AnnouncementPanelProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(saveAction);
  const [message, setMessage] = useState(announcement?.message ?? "");

  return (
    <div className="space-y-5">
      {announcement === null ? null : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-semibold text-ink">{announcementStatus(announcement, today)}</p>
          <RemoveForm clearAction={clearAction} onRemoved={() => setMessage("")} />
        </div>
      )}

      <form ref={formRef} action={formAction} className="space-y-4">
        <div>
          <label htmlFor="announcement-message" className={DETAILS_LABEL}>
            Message
            <RequiredMark />
          </label>
          <input
            id="announcement-message"
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, ANNOUNCEMENT_MAX_LENGTH))}
            maxLength={ANNOUNCEMENT_MAX_LENGTH}
            required
            placeholder="Closed for Diwali, back Nov 3"
            className={DETAILS_FIELD}
            {...controls.fieldStatus("message")}
          />
          <p className="mt-1 text-xs tabular-nums text-ink-2">
            {message.length}/{ANNOUNCEMENT_MAX_LENGTH}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="announcement-startsOn" className={DETAILS_LABEL}>
              Starts
              <RequiredMark />
            </label>
            <input
              id="announcement-startsOn"
              name="startsOn"
              type="date"
              max={MAX_DATE}
              required
              defaultValue={controls.valueOf("startsOn", announcement?.startsOn ?? defaultStartsOn)}
              className={DETAILS_FIELD}
              {...controls.fieldStatus("startsOn")}
            />
          </div>
          <div>
            <label htmlFor="announcement-endsOn" className={DETAILS_LABEL}>
              Ends
              <RequiredMark />
            </label>
            <input
              id="announcement-endsOn"
              name="endsOn"
              type="date"
              max={MAX_DATE}
              required
              defaultValue={controls.valueOf("endsOn", announcement?.endsOn ?? defaultEndsOn)}
              className={DETAILS_FIELD}
              {...controls.fieldStatus("endsOn")}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <SaveButton label="Save" pendingLabel="Saving…" startKey={JSON.stringify(announcement)} />
          <PanelFormStatus controls={controls} statusRef={statusRef} />
        </div>
      </form>
    </div>
  );
}
