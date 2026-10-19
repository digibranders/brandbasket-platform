"use client";

import Link from "next/link";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import type { ListingContentRow } from "@brandbasket/db";
import {
  LISTING_ABOUT_MAX_LENGTH,
  LISTING_BUTTONS,
  LISTING_BUTTON_LABELS,
  LISTING_TAGLINE_COLOURS,
  LISTING_TAGLINE_COLOUR_LABELS,
  LISTING_TAGLINE_MAX_LENGTH,
  LISTING_TAGLINE_STYLES,
  LISTING_TAG_LIMIT,
  LISTING_TAG_MAX_LENGTH,
  DEFAULT_TAGLINE_COLOUR,
  isTaglineColour,
  containsContactDetails,
  type ListingButton,
} from "@brandbasket/shared/lib/directory/listing-content";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { WhereItShows } from "@/components/panel/where-it-shows";
import type { WhereItShowsSpot } from "@/lib/where-it-shows";

/** Written as escapes to keep the source plain text. */
const DOT_SEPARATOR = " \u00b7 ";
const ELLIPSIS = "\u2026";
const TIMES = "\u00d7";

/** The announcement showing today and its last day, already formatted, e.g. "3 October 2026". */
export interface ListingAnnouncement {
  readonly message: string;
  readonly until: string;
}

/** One day of the week and its opening hours as a line of text, e.g. { day: "Monday", hours: "10:00 - 13:30" }. */
export interface ListingHoursLine {
  readonly day: string;
  readonly hours: string;
}

interface ListingDetailsProps {
  readonly content: ListingContentRow;
  /** Every write needs a paid plan, so an unpaid or lapsed business sees its rows without the Edit controls. */
  readonly editable: boolean;
  /** Why a button cannot be switched on yet: Book needs Appointments, Website needs a launched website. */
  readonly unavailable: Readonly<Partial<Record<ListingButton, string>>>;
  readonly hours: readonly ListingHoursLine[];
  /** Whether it is open now and when that changes, e.g. "Open · Closes 7 pm"; null when no hours are given. */
  readonly hoursStatus: string | null;
  /** The announcement showing today, or null when none is. */
  readonly announcement: ListingAnnouncement | null;
  readonly actions: {
    readonly about: PanelFormAction;
    readonly tagline: PanelFormAction;
    readonly tags: PanelFormAction;
    readonly buttons: PanelFormAction;
    readonly visible: PanelFormAction;
  };
}

/** Label, value, control. The label column narrows on a phone so the value keeps most of the width. */
const ROW_GRID =
  "grid grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto]";
const ROW_LABEL = "text-sm font-semibold text-ink-soft";
const ROW_CONTROL = "text-sm font-semibold text-ink-soft transition-colors duration-300 ease-calm hover:text-accent";
const MUTED = "text-ink-soft";

interface RowProps {
  readonly label: string;
  readonly value: ReactNode;
  /** What opens in place under the row. Without it the row has no toggle. */
  readonly children?: ReactNode;
  /** The toggle's two words, "Edit" and "Close" unless the row only reveals something. */
  readonly toggle?: { readonly open: string; readonly close: string };
  /** Shows the toggle as a chevron (pointing down, up when open) instead of its words; the words stay as its label. */
  readonly chevron?: boolean;
  /** A control that goes somewhere else instead of opening in place, e.g. a link to Your details. */
  readonly control?: ReactNode;
  /** Where on the public business page this row shows: a small "See where this shows" link under the value. */
  readonly where?: { readonly spot: WhereItShowsSpot; readonly caption: string };
}

/** One row: label, current value, and either an Edit toggle that opens its form in place or a link elsewhere. */
function Row({ label, value, children, toggle = { open: "Edit", close: "Close" }, chevron = false, control, where }: RowProps): ReactElement {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasPanel = children !== undefined;
  return (
    <li className="border-b border-line">
      <div className={`${ROW_GRID} items-baseline`}>
        <span className={ROW_LABEL}>{label}</span>
        <div className="min-w-0 break-words text-sm">
          {value}
          {where === undefined ? null : (
            <div className="mt-1">
              <WhereItShows spot={where.spot} caption={where.caption} />
            </div>
          )}
        </div>
        {hasPanel ? (
          <button
            type="button"
            className={ROW_CONTROL}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? toggle.close : toggle.open} ${label.toLowerCase()}`}
            onClick={() => setOpen(!open)}
          >
            {chevron ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className={`size-5 transition-transform duration-300 ease-calm ${open ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 7.5 5 5 5-5" />
              </svg>
            ) : open ? (
              toggle.close
            ) : (
              toggle.open
            )}
          </button>
        ) : (
          (control ?? <span />)
        )}
      </div>
      {hasPanel && open ? (
        <div id={panelId} className="pb-6">
          {children}
        </div>
      ) : null}
    </li>
  );
}

function SaveButton({ pending }: { readonly pending: boolean }): ReactElement {
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? `Saving${ELLIPSIS}` : "Save"}
    </Button>
  );
}

interface AboutFormProps {
  readonly about: string | null;
  readonly action: PanelFormAction;
}

function AboutForm({ about, action }: AboutFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const [value, setValue] = useState(about ?? "");
  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <label htmlFor="listing-about" className="sr-only">
        One line about your business
      </label>
      {/* A single-line input, not a textarea: the field is one line, and a textarea's trailing newline would be
          refused as "not one line". */}
      <input
        id="listing-about"
        name="about"
        value={value}
        onChange={(event) => setValue(event.target.value.slice(0, LISTING_ABOUT_MAX_LENGTH))}
        maxLength={LISTING_ABOUT_MAX_LENGTH}
        placeholder="Gentle family dentistry, open late on weekdays"
        className={FIELD_CLASSES}
        {...controls.fieldStatus("about")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-ink-soft">
          {value.length}/{LISTING_ABOUT_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-3">
          <PanelFormStatus controls={controls} statusRef={statusRef} />
          <SaveButton pending={controls.isPending} />
        </div>
      </div>
    </form>
  );
}

interface TaglineFormProps {
  readonly tagline: string | null;
  readonly colour: string;
  readonly action: PanelFormAction;
}

/** The tagline card's line and colour, with the card itself drawn as it will look on the business's page. */
function TaglineForm({ tagline, colour, action }: TaglineFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const [text, setText] = useState(tagline ?? "");
  const [chosen, setChosen] = useState(isTaglineColour(colour) ? colour : DEFAULT_TAGLINE_COLOUR);
  const style = LISTING_TAGLINE_STYLES[chosen];
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div
        className="rounded-xl px-5 py-6 text-lg leading-snug font-bold"
        style={{ backgroundColor: style.background, color: style.text }}
        aria-hidden="true"
      >
        {text.trim() === "" ? "Your tagline shows here" : text}
      </div>
      <label htmlFor="listing-tagline" className="sr-only">
        Your tagline
      </label>
      <input
        id="listing-tagline"
        name="tagline"
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, LISTING_TAGLINE_MAX_LENGTH))}
        maxLength={LISTING_TAGLINE_MAX_LENGTH}
        placeholder="Gentle dentistry for the whole family"
        className={FIELD_CLASSES}
        {...controls.fieldStatus("tagline")}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-soft">
          Colour <RequiredMark />
        </legend>
        <div className="flex flex-wrap gap-3">
          {LISTING_TAGLINE_COLOURS.map((option) => (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name="colour"
                value={option}
                checked={chosen === option}
                onChange={() => setChosen(option)}
                required
                className="peer sr-only"
              />
              <span
                className="grid size-9 place-items-center rounded-full border border-line text-xs font-bold ring-offset-2 transition-shadow duration-300 ease-calm peer-checked:ring-2 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                style={{ backgroundColor: LISTING_TAGLINE_STYLES[option].background, color: LISTING_TAGLINE_STYLES[option].text }}
              >
                A
                <span className="sr-only">{LISTING_TAGLINE_COLOUR_LABELS[option]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-ink-soft">
          {text.length}/{LISTING_TAGLINE_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-3">
          <PanelFormStatus controls={controls} statusRef={statusRef} />
          <SaveButton pending={controls.isPending} />
        </div>
      </div>
    </form>
  );
}

interface TagsFormProps {
  readonly tags: readonly string[];
  readonly action: PanelFormAction;
}

function TagsForm({ tags, action }: TagsFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const [list, setList] = useState<readonly string[]>(tags);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();

  /** The same checks the server makes on each tag, run as it is added, so a bad one never joins the list. */
  function add(): void {
    const tag = draft.trim();
    if (tag === "" || list.length >= LISTING_TAG_LIMIT) return;
    if (tag.length > LISTING_TAG_MAX_LENGTH) {
      setProblem(`Keep each service to ${LISTING_TAG_MAX_LENGTH} characters.`);
      return;
    }
    if (containsContactDetails(tag)) {
      setProblem("No web addresses or phone numbers here.");
      return;
    }
    if (!list.some((existing) => existing.toLowerCase() === tag.toLowerCase())) setList([...list, tag]);
    setDraft("");
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {list.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {list.map((tag) => (
            <li key={tag} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-2 text-sm">
              <input type="hidden" name="tag" value={tag} />
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="px-1 text-ink-soft transition-colors duration-300 ease-calm hover:text-accent"
                onClick={() => setList(list.filter((item) => item !== tag))}
              >
                <span aria-hidden="true">{TIMES}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="listing-tag" className="sr-only">
        Add a service
      </label>
      {/* Named "tag" too, so a service typed but not yet added is saved rather than dropped; the server skips an
          empty one and refuses a ninth. Leaving the field adds what was typed, so Save sees it in the list. */}
      <input
        id="listing-tag"
        name="tag"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(null);
        }}
        onBlur={add}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        disabled={list.length >= LISTING_TAG_LIMIT}
        placeholder={list.length >= LISTING_TAG_LIMIT ? "Remove one to add another" : "Add a service, then press Enter"}
        className={FIELD_CLASSES}
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={problem === null ? undefined : problemId}
        {...controls.fieldStatus("tag")}
      />
      <p id={problemId} role="status" aria-live="polite" className="text-xs text-accent-deep">
        {problem}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-ink-soft">
          {list.length} of {LISTING_TAG_LIMIT}
        </span>
        <div className="flex items-center gap-3">
          <PanelFormStatus controls={controls} statusRef={statusRef} />
          <SaveButton pending={controls.isPending} />
        </div>
      </div>
    </form>
  );
}

function ButtonsForm({
  buttons,
  unavailable,
  action,
}: {
  readonly buttons: ListingContentRow["buttons"];
  readonly unavailable: ListingDetailsProps["unavailable"];
  readonly action: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="space-y-1">
      {LISTING_BUTTONS.map((button) => {
        const reason = unavailable[button];
        const saved = buttons[button];
        return (
          <label key={button} className="flex items-center justify-between gap-4 py-1.5 text-sm">
            <span>
              {LISTING_BUTTON_LABELS[button]}
              {reason === undefined ? null : <span className="ml-2 text-xs text-ink-soft">{reason}</span>}
            </span>
            <input
              type="checkbox"
              name={button}
              defaultChecked={controls.valueOf(button, saved ? "on" : "") === "on"}
              disabled={reason !== undefined}
              className="size-4 accent-accent"
            />
            {/* A disabled box posts nothing, which would save it as off: keep what is stored until it can be
                switched again (Website stays on through the build, ready for launch day). */}
            {reason !== undefined && saved ? <input type="hidden" name={button} value="on" /> : null}
          </label>
        );
      })}
      <div className="flex items-center justify-end gap-3 pt-3">
        <PanelFormStatus controls={controls} statusRef={statusRef} />
        <SaveButton pending={controls.isPending} />
      </div>
    </form>
  );
}

function VisibleForm({
  visible,
  editable,
  action,
}: {
  readonly visible: boolean;
  readonly editable: boolean;
  readonly action: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center justify-end gap-3">
      <input type="hidden" name="visible" value={visible ? "off" : "on"} />
      <PanelFormStatus controls={controls} statusRef={statusRef} />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!editable || controls.isPending}
        aria-busy={controls.isPending}
        aria-label={visible ? "Hide from the directory" : "Show in the directory"}
      >
        {visible ? "Hide" : "Show"}
      </Button>
    </form>
  );
}

function joined(parts: readonly string[], empty: string): ReactNode {
  return parts.length === 0 ? <span className={MUTED}>{empty}</span> : parts.join(DOT_SEPARATOR);
}

/** The rows a client edits, plus the two they share with their website (hours, announcement), which link there. */
export function ListingDetails({
  content,
  editable,
  unavailable,
  hours,
  hoursStatus,
  announcement,
  actions,
}: ListingDetailsProps): ReactElement {
  const shownButtons = LISTING_BUTTONS.filter((button) => content.buttons[button] && unavailable[button] === undefined);
  const announcementLink = (
    <Link href="/details" className={ROW_CONTROL} aria-label="Change the announcement on Your details">
      Change
    </Link>
  );

  return (
    <ul>
      <Row
        label="About"
        value={content.about ?? <span className={MUTED}>One line about you</span>}
        where={{ spot: "about", caption: "Your line shows in the About section of your page." }}
      >
        {editable ? <AboutForm about={content.about} action={actions.about} /> : undefined}
      </Row>
      <Row label="Tagline" value={content.tagline ?? <span className={MUTED}>A line that stands out on your page</span>}>
        {editable ? <TaglineForm tagline={content.tagline} colour={content.taglineColour} action={actions.tagline} /> : undefined}
      </Row>
      <Row
        label="Services"
        value={joined(content.tags, "None yet")}
        where={{ spot: "services", caption: "Your services show as cards in the Services section of your page." }}
      >
        {editable ? <TagsForm tags={content.tags} action={actions.tags} /> : undefined}
      </Row>
      <Row
        label="Hours"
        value={hoursStatus === null ? <span className={MUTED}>Not set</span> : <span className={hoursStatus.startsWith("Closed") ? "font-semibold text-[#a63a2c]" : "font-semibold text-[#1f7a4d]"}>{hoursStatus}</span>}
        toggle={{ open: "Show", close: "Hide" }}
        chevron
        where={{ spot: "hours", caption: "Your hours show under Location, and the Open now tag follows them." }}
      >
        <div className="space-y-4">
          <ul className="space-y-1 text-sm">
            {hours.map((line) => (
              <li key={line.day} className="flex gap-3">
                <span className="w-24 shrink-0 text-ink-soft">{line.day}</span>
                <span className="tabular-nums">{line.hours}</span>
              </li>
            ))}
          </ul>
          <Link href="/details" className="link-underline inline-block text-sm text-ink-soft">
            Change on Your details
          </Link>
        </div>
      </Row>
      <Row
        label="Announcement"
        value={
          announcement === null ? (
            <span className={MUTED}>None</span>
          ) : (
            `${announcement.message}${DOT_SEPARATOR}until ${announcement.until}`
          )
        }
        control={editable ? announcementLink : undefined}
      />
      <Row
        label="Buttons"
        value={joined(shownButtons.map((button) => LISTING_BUTTON_LABELS[button]), "None")}
        where={{ spot: "buttons", caption: "Your buttons show in a row just under your business name." }}
      >
        {editable ? (
          <ButtonsForm buttons={content.buttons} unavailable={unavailable} action={actions.buttons} />
        ) : undefined}
      </Row>
      <li className={`${ROW_GRID} items-center border-b border-line`}>
        <span className={ROW_LABEL}>In directory</span>
        <span className="text-sm">{content.visible ? "Shown" : <span className={MUTED}>Hidden</span>}</span>
        <VisibleForm visible={content.visible} editable={editable} action={actions.visible} />
      </li>
    </ul>
  );
}
