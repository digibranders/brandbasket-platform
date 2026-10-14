"use client";

import type { ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { META_DESCRIPTION_MAX_LENGTH, META_TITLE_MAX_LENGTH, truncateAtWord } from "@/lib/blog-seo";
import { seoHealthGrade, type SeoHealth } from "@/lib/blog-seo-health";
import { CheckGlyph } from "./icons";
import { AutoToggle, Counter, FieldLabel, INPUT_CLASS, SidebarSection, Switch } from "./parts";

interface SearchPanelProps {
  /** The address as Google would show it: "asterphysio.com › blog › desk-stretches". */
  readonly breadcrumb: string;
  /** What the title and description fall back to while "Auto" is on. */
  readonly titleDefault: string;
  readonly descriptionDefault: string | null;
  /** "Search title follows the post title", "… the category name". */
  readonly titleFollows: string;
  /** Where the description comes from while "Auto" is on: "Taken from your summary, or the start of your post". */
  readonly descriptionSource: string;
  /** What the preview says while there is no description at all. */
  readonly descriptionEmpty: string;
  readonly metaTitleAuto: boolean;
  readonly metaTitle: string;
  readonly metaDescriptionAuto: boolean;
  readonly metaDescription: string;
  /** Leave out to hide the "Hide from Google" switch (a category page has none). */
  readonly noIndex?: boolean;
  readonly onChange: (
    patch: Partial<{
      metaTitleAuto: boolean;
      metaTitle: string;
      metaDescriptionAuto: boolean;
      metaDescription: string;
      noIndex: boolean;
    }>,
  ) => void;
}

/** How the page appears in Google, and the fields that shape it. Shared by the post and category editors. */
export function SearchPanel({
  breadcrumb,
  titleDefault,
  descriptionDefault,
  titleFollows,
  descriptionSource,
  descriptionEmpty,
  metaTitleAuto,
  metaTitle,
  metaDescriptionAuto,
  metaDescription,
  noIndex,
  onChange,
}: SearchPanelProps): ReactElement {
  const hidden = noIndex === true;
  const shownTitle = metaTitleAuto || metaTitle.trim() === "" ? titleDefault : metaTitle;
  const shownDescription = metaDescriptionAuto || metaDescription.trim() === "" ? descriptionDefault : metaDescription;

  return (
    <SidebarSection title="Google preview" aside={hidden ? "Hidden" : null}>
      <div className={cn("rounded-control bg-card px-4 py-3.5 ring-1 ring-line/70", hidden && "opacity-50")}>
        <p className="truncate text-xs text-ink-soft">{breadcrumb}</p>
        <p className="mt-1 line-clamp-2 text-[1.0625rem] leading-snug text-[#1a0dab]">
          {truncateAtWord(shownTitle || "Your post title", META_TITLE_MAX_LENGTH)}
        </p>
        <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-soft">
          {shownDescription === null || shownDescription === ""
            ? descriptionEmpty
            : truncateAtWord(shownDescription, META_DESCRIPTION_MAX_LENGTH)}
        </p>
      </div>

      <div className="mt-5">
        <FieldLabel
          htmlFor="metaTitle"
          aside={
            <>
              <AutoToggle
                checked={metaTitleAuto}
                label={titleFollows}
                onChange={(auto) => onChange(auto ? { metaTitleAuto: true } : { metaTitleAuto: false, metaTitle: metaTitle || titleDefault })}
              />
              <Counter value={shownTitle.length} max={META_TITLE_MAX_LENGTH} />
            </>
          }
        >
          Search title
        </FieldLabel>
        <input
          id="metaTitle"
          value={metaTitleAuto ? titleDefault : metaTitle}
          readOnly={metaTitleAuto}
          maxLength={200}
          onChange={(event) => onChange({ metaTitle: event.target.value })}
          className={cn(INPUT_CLASS, "text-sm", metaTitleAuto && "cursor-default bg-paper-deep/50 text-ink-soft")}
        />
      </div>

      <div className="mt-4">
        <FieldLabel
          htmlFor="metaDescription"
          aside={
            <>
              <AutoToggle
                checked={metaDescriptionAuto}
                label="Search description follows the default"
                onChange={(auto) =>
                  onChange(
                    auto
                      ? { metaDescriptionAuto: true }
                      : { metaDescriptionAuto: false, metaDescription: metaDescription || (descriptionDefault ?? "") },
                  )
                }
              />
              <Counter value={(shownDescription ?? "").length} max={META_DESCRIPTION_MAX_LENGTH} />
            </>
          }
        >
          Search description
        </FieldLabel>
        <textarea
          id="metaDescription"
          rows={3}
          value={metaDescriptionAuto ? (descriptionDefault ?? "") : metaDescription}
          readOnly={metaDescriptionAuto}
          maxLength={META_DESCRIPTION_MAX_LENGTH}
          placeholder={descriptionSource}
          onChange={(event) => onChange({ metaDescription: event.target.value })}
          className={cn(INPUT_CLASS, "resize-none text-sm", metaDescriptionAuto && "cursor-default bg-paper-deep/50 text-ink-soft")}
        />
      </div>

      {noIndex === undefined ? null : (
        <div className="mt-3">
          <Switch
            checked={noIndex}
            onChange={(checked) => onChange({ noIndex: checked })}
            label="Hide from Google"
            hint="The post stays on your website but won’t show in search results."
          />
        </div>
      )}
    </SidebarSection>
  );
}

const GRADE_TONES = {
  good: "text-accent-deep",
  fair: "text-ink",
  poor: "text-ink-soft",
} as const;

/** "Ready to publish?": the SEO health checklist, collapsed to a score until opened. */
export function HealthPanel({ health }: { readonly health: SeoHealth }): ReactElement {
  const grade = seoHealthGrade(health.score);
  const done = health.checks.filter((check) => check.passed).length;
  return (
    <SidebarSection
      title="Post checklist"
      collapsible
      defaultOpen={false}
      aside={<span className={cn("text-xs tabular-nums", GRADE_TONES[grade])}>{done} of {health.checks.length}</span>}
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
        <div
          className="h-full rounded-full bg-accent-deep transition-[width] duration-500 ease-calm"
          style={{ width: `${health.score}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {health.checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full",
                check.passed ? "bg-accent-deep text-paper" : "ring-1 ring-inset ring-ink-soft/40",
              )}
            >
              {check.passed ? <CheckGlyph className="size-3" /> : null}
            </span>
            <span className={check.passed ? "text-ink-soft line-through decoration-ink-soft/40" : "text-ink"}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
