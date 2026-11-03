"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface FileDropItem {
  readonly id: string;
  readonly name: string;
  /** Already written for reading ("1.2 MB"). */
  readonly size: string;
  /** 0 to 100 while uploading; leave out when done. */
  readonly progress?: number;
  readonly error?: string;
}

export interface FileDropProps {
  /** The button's words, such as "Choose files". */
  readonly chooseLabel: string;
  /** What may be added, stated before upload: types and size limit ("JPG or PNG, up to 4 MB each"). */
  readonly description: ReactNode;
  /** The input's accept list, such as "image/jpeg,image/png". */
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
  /** Called with the files chosen or dropped. The feature checks type and size and uploads. */
  readonly onFiles: (files: readonly File[]) => void;
  /** The files being or already uploaded, each with its progress or error. */
  readonly files?: readonly FileDropItem[];
  readonly className?: string;
}

/** Drag files in or choose them, with per-file progress and per-file errors (plan 60, FileDrop). */
export function FileDrop({ chooseLabel, description, accept, multiple = false, disabled = false, onFiles, files = [], className }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (list === null || list.length === 0) return;
    onFiles(multiple ? Array.from(list) : Array.from(list).slice(0, 1));
  };
  const onDragOver = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    setOver(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (!disabled) take(event.dataTransfer.files);
  };

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {/* One compact row. The button holds only its own words, so its name is what it shows; its ::after stretches over the box so the whole box opens the picker. The description sits beside it, never inside it, so it can carry a link. */}
      <div
        data-disabled={disabled || undefined}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx(
          "group relative flex w-full items-center gap-3 rounded-control border border-dashed border-border-button bg-surface px-3 py-2.5 text-left transition-colors duration-100",
          "hover:border-border-button-hover hover:bg-surface-subtle has-[:focus-visible]:border-ring has-[:focus-visible]:shadow-focus",
          "data-disabled:bg-surface-disabled",
          over && "border-ring bg-accent-wash hover:border-ring hover:bg-accent-wash",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-accent-wash text-accent-text group-data-disabled:bg-neutral-wash group-data-disabled:text-ink-disabled">
          <Icon name="UploadSimple" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            disabled={disabled}
            aria-describedby={descriptionId}
            onClick={() => input.current?.click()}
            className="w-fit text-left type-button text-accent-text outline-none after:absolute after:inset-0 after:content-[''] disabled:cursor-not-allowed disabled:text-ink-disabled"
          >
            {chooseLabel}
          </button>
          <span id={descriptionId} className="pointer-events-none relative type-meta [&_a]:pointer-events-auto">
            {description}
          </span>
        </span>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        aria-hidden
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          take(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {files.length === 0 ? null : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-control border border-border">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-1.5 px-3 py-2">
              <div className="flex items-center gap-2">
                <Icon name={file.error === undefined ? "FileText" : "WarningCircle"} size="sm" className={file.error === undefined ? "text-ink-3" : "text-neg-text"} />
                <span className="min-w-0 flex-1 truncate type-body">{file.name}</span>
                <span className="type-meta">{file.size}</span>
              </div>
              {file.error === undefined ? null : <p className="type-meta text-neg-text">{file.error}</p>}
              {file.progress === undefined || file.error !== undefined ? null : (
                <div role="progressbar" aria-label={file.name} aria-valuenow={file.progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-neutral-wash">
                  <div className="h-full bg-c1" style={{ width: `${file.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
