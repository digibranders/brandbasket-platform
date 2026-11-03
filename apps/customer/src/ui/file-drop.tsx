"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "./button";
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
      <div
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx(
          "flex flex-col items-center gap-1.5 rounded-panel border-[1.5px] border-dashed border-border-control bg-surface-subtle p-5 text-center",
          over && "border-ring bg-accent-wash",
        )}
      >
        <Icon name="UploadSimple" className="text-ink-3" />
        <Button size="sm" disabled={disabled} aria-describedby={descriptionId} onClick={() => input.current?.click()}>
          {chooseLabel}
        </Button>
        <p id={descriptionId} className="type-meta">
          {description}
        </p>
        <input
          ref={input}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            take(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
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
