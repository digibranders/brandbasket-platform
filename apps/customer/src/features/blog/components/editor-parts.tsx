"use client";

import { prepareImageForUpload } from "@brandbasket/shared/lib/uploads/prepare-image";
import { MAX_UPLOAD_SIZE_LABEL, UPLOAD_FILE_NAME_HEADER } from "@brandbasket/shared/lib/uploads/limits";
import { sendImage } from "@brandbasket/shared/lib/uploads/send-image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Panel } from "@/components";
import type { ActionResult } from "@/lib/action-result";
import { formatBytes } from "@/lib/format";
import { Badge, Button, Dialog, DialogClose, Field, FileDrop, Icon, Input, Select, Switch, Textarea, type BadgeTone, type FileDropItem } from "@/ui";
import { META_DESCRIPTION_MAX_LENGTH, META_TITLE_MAX_LENGTH, seoHealthGrade, truncateAtWord, type SeoHealth } from "../rules/seo";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/** "12 of 70": how long a field is against what search engines show. Over the limit is a warning, nothing is cut. */
export function Counter({ value, max }: { readonly value: number; readonly max: number }) {
  return <span className={value > max ? "type-meta text-warn-text" : "type-meta"}>{`${value} of ${max}`}</span>;
}

export interface ImageFieldProps {
  readonly label: string;
  /** The stored image, or null. */
  readonly image: { readonly url: string } | null;
  /** Upload route with the post or author in its query: the server attaches the image to it. */
  readonly uploadUrl: string;
  readonly remove: () => Promise<ActionResult>;
  readonly readOnly: boolean;
  /** Called after a successful upload or removal, before the page refreshes. */
  readonly onChanged?: (kind: "uploaded" | "removed") => void;
}

/**
 * Choose, replace or remove one image. The file is shrunk in the browser, sent to the upload route, and the page refreshes
 * to show what was stored. Types and size are stated before upload (plan 60, section 14).
 */
export function ImageField({ label, image, uploadUrl, remove, readOnly, onChanged }: ImageFieldProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [problems, setProblems] = useState<readonly FileDropItem[]>([]);
  const busy = uploading || removing;

  async function upload(files: readonly File[]): Promise<void> {
    const file = files[0];
    if (file === undefined) return;
    setUploading(true);
    setProblems([]);
    const body = await prepareImageForUpload(file, "photo");
    const result = await sendImage(uploadUrl, body, { [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name) });
    setUploading(false);
    if (!result.ok) {
      setProblems([{ id: `failed-${file.name}`, name: file.name, size: formatBytes(file.size), error: result.message }]);
      return;
    }
    onChanged?.("uploaded");
    router.refresh();
  }

  const removeImage = () =>
    startRemoving(async () => {
      const result = await remove();
      if (!result.ok) setProblems([{ id: "remove", name: label, size: "", error: result.message }]);
      else onChanged?.("removed");
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="type-sub text-ink">{label}</span>
      {image === null ? null : (
        // The image optimiser is skipped: it would fetch without the session.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.url} alt="" className="aspect-video w-full max-w-md rounded-control border border-border bg-surface-subtle object-cover" />
      )}
      {readOnly ? null : (
        <>
          {image === null ? null : (
            <div>
              <Button size="sm" disabled={busy} pending={removing} onClick={removeImage}>
                Remove
              </Button>
            </div>
          )}
          <FileDrop
            chooseLabel={image === null ? "Upload an image" : "Replace image"}
            description={`JPEG, PNG or WebP, up to ${MAX_UPLOAD_SIZE_LABEL}. We shrink large photos.`}
            accept={ACCEPTED_TYPES}
            disabled={busy}
            onFiles={(files) => void upload(files)}
            files={problems}
          />
        </>
      )}
    </div>
  );
}

const NONE = "none";

export interface TaxonomyPickerProps {
  readonly label: string;
  readonly noneLabel: string;
  readonly addLabel: string;
  readonly options: readonly { readonly id: string; readonly name: string }[];
  /** "" for none. */
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly create: (name: string) => Promise<ActionResult<{ readonly id: string; readonly name: string }>>;
  readonly readOnly: boolean;
}

/** A category or author, with "New" beside it so writing a post never means leaving the editor. */
export function TaxonomyPicker({ label, noneLabel, addLabel, options, value, onChange, create, readOnly }: TaxonomyPickerProps) {
  const [added, setAdded] = useState<readonly { readonly id: string; readonly name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const all = [...options, ...added.filter((item) => !options.some((option) => option.id === item.id))];

  const submit = () =>
    startTransition(async () => {
      const result = await create(name);
      if (!result.ok || result.data === undefined) {
        setError(result.ok ? undefined : result.message);
        return;
      }
      const created = result.data;
      setAdded((current) => [...current, created]);
      onChange(created.id);
      setName("");
      setError(undefined);
      setOpen(false);
    });

  return (
    <div className="flex flex-col gap-2">
      <Field label={label} nativeLabel={false} disabled={readOnly}>
        <Select
          options={[{ value: NONE, label: noneLabel }, ...all.map((option) => ({ value: option.id, label: option.name }))]}
          value={value === "" ? NONE : value}
          onValueChange={(next) => onChange(next === null || next === NONE ? "" : next)}
          disabled={readOnly}
        />
      </Field>
      {readOnly ? null : (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button size="sm" variant="ghost" icon="Plus" className="w-fit">
              {addLabel}
            </Button>
          }
          title={addLabel}
          footer={
            <>
              <DialogClose>
                <Button>Cancel</Button>
              </DialogClose>
              <Button variant="primary" pending={pending} onClick={submit}>
                Add
              </Button>
            </>
          }
        >
          <Field label="Name" error={error}>
            <Input
              value={name}
              maxLength={60}
              autoFocus
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </Field>
        </Dialog>
      )}
    </div>
  );
}

export interface SearchFieldsProps {
  /** How Google shows the address: "asterphysio.com › blog › desk-stretches". */
  readonly breadcrumb: string;
  /** What the title and description are while Auto is on. */
  readonly titleDefault: string;
  readonly descriptionDefault: string | null;
  readonly titleAutoLabel: string;
  readonly descriptionAutoLabel: string;
  readonly descriptionEmpty: string;
  readonly metaTitleAuto: boolean;
  readonly metaTitle: string;
  readonly metaDescriptionAuto: boolean;
  readonly metaDescription: string;
  /** Leave out where there is no "Hide from Google" (a category). */
  readonly noIndex?: boolean;
  readonly readOnly: boolean;
  readonly errors?: Readonly<Record<string, string>>;
  readonly onChange: (patch: Partial<{ metaTitleAuto: boolean; metaTitle: string; metaDescriptionAuto: boolean; metaDescription: string; noIndex: boolean }>) => void;
}

/** How the page appears on Google, and the fields that shape it. Shared by the post and category editors. */
export function SearchFields(props: SearchFieldsProps) {
  const { breadcrumb, titleDefault, descriptionDefault, metaTitleAuto, metaTitle, metaDescriptionAuto, metaDescription, noIndex, readOnly, onChange } = props;
  const shownTitle = metaTitleAuto || metaTitle.trim() === "" ? titleDefault : metaTitle;
  const shownDescription = metaDescriptionAuto || metaDescription.trim() === "" ? descriptionDefault : metaDescription;
  return (
    <Panel title="Google preview" meta={noIndex === true ? "Hidden from Google" : undefined}>
      <div className="flex flex-col gap-4">
        <div className="rounded-control border border-border-subtle bg-surface-subtle p-3">
          <p className="truncate type-meta">{breadcrumb}</p>
          <p className="type-sub text-accent-text">{truncateAtWord(shownTitle === "" ? "Your title" : shownTitle, META_TITLE_MAX_LENGTH)}</p>
          <p className="type-meta">{shownDescription === null || shownDescription === "" ? props.descriptionEmpty : truncateAtWord(shownDescription, META_DESCRIPTION_MAX_LENGTH)}</p>
        </div>
        <Switch
          label={props.titleAutoLabel}
          checked={metaTitleAuto}
          disabled={readOnly}
          onCheckedChange={(auto) => onChange(auto ? { metaTitleAuto: true } : { metaTitleAuto: false, metaTitle: metaTitle || titleDefault })}
        />
        <Field label="Search title" hint={<Counter value={shownTitle.length} max={META_TITLE_MAX_LENGTH} />} error={props.errors?.metaTitle} disabled={readOnly || metaTitleAuto}>
          <Input value={metaTitleAuto ? titleDefault : metaTitle} readOnly={metaTitleAuto} maxLength={200} onChange={(event) => onChange({ metaTitle: event.currentTarget.value })} />
        </Field>
        <Switch
          label={props.descriptionAutoLabel}
          checked={metaDescriptionAuto}
          disabled={readOnly}
          onCheckedChange={(auto) => onChange(auto ? { metaDescriptionAuto: true } : { metaDescriptionAuto: false, metaDescription: metaDescription || (descriptionDefault ?? "") })}
        />
        <Field
          label="Search description"
          hint={<Counter value={(shownDescription ?? "").length} max={META_DESCRIPTION_MAX_LENGTH} />}
          error={props.errors?.metaDescription}
          disabled={readOnly || metaDescriptionAuto}
        >
          <Textarea
            rows={3}
            value={metaDescriptionAuto ? (descriptionDefault ?? "") : metaDescription}
            readOnly={metaDescriptionAuto}
            maxLength={META_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => onChange({ metaDescription: event.currentTarget.value })}
          />
        </Field>
        {noIndex === undefined ? null : (
          <div className="flex flex-col gap-1">
            <Switch label="Hide from Google" checked={noIndex} disabled={readOnly} onCheckedChange={(checked) => onChange({ noIndex: checked })} />
            <p className="type-meta">The post stays on your website but does not show in search results.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

const GRADE: Readonly<Record<ReturnType<typeof seoHealthGrade>, { readonly tone: BadgeTone; readonly word: string }>> = {
  good: { tone: "pos", word: "Good" },
  fair: { tone: "warn", word: "Fair" },
  poor: { tone: "neutral", word: "Needs work" },
};

/** The post checklist: what to fix before publishing, and the share of checks passed. A writing aid, not a ranking promise. */
export function HealthChecklist({ health }: { readonly health: SeoHealth }) {
  const grade = GRADE[seoHealthGrade(health.score)];
  return (
    <Panel title="Post checklist" meta={<Badge tone={grade.tone}>{`${grade.word}, ${health.score} of 100`}</Badge>}>
      <ul className="flex flex-col gap-2">
        {health.checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 type-body">
            <Icon name={check.passed ? "CheckCircle" : "Circle"} size="sm" className={check.passed ? "text-pos-text" : "text-ink-muted"} />
            <span className={check.passed ? "text-ink" : "text-ink-2"}>{check.label}</span>
            <span className="sr-only">{check.passed ? "Done" : "Not yet"}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** A titled group of fields in the editor's side column. */
export function SidePanel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Panel title={title}>
      <div className="flex flex-col gap-4">{children}</div>
    </Panel>
  );
}
