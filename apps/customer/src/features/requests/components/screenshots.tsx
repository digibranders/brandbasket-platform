"use client";

import Image from "next/image";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { z } from "zod";
import { FileDrop, Icon } from "@/ui";
import { ATTACHMENT_HINT, ATTACHMENT_LIMIT, ATTACHMENT_TYPES, checkAttachments } from "../rules";

/*
 * Screenshots go to the platform's upload endpoint (apps/platform app/api/support-uploads/route.ts), which checks the type,
 * re-encodes the image and stages it for 24 hours; the form then sends the staged ids. In production the platform serves
 * /api/* on the app's own host. In development the customer app has no such route until next.config.ts rewrites it.
 */
const UPLOAD_PATH = "/api/support-uploads";

const uploadResult = z.object({ attachments: z.array(z.object({ id: z.uuid() })).min(1).max(ATTACHMENT_LIMIT) });

interface Shot {
  readonly key: string;
  readonly name: string;
  readonly id: string;
  /** A local preview of the file, released when the shot is removed or the picker goes away. */
  readonly url: string;
}

/** Lets the form hand over screenshots pasted anywhere in it (features/requests/paste.ts). */
export interface ScreenshotsHandle {
  readonly addFiles: (files: readonly File[]) => void;
}

export interface ScreenshotsProps {
  /** The staged ids, for the form's hidden fields. */
  readonly onIds: (ids: readonly string[]) => void;
  /** True while an upload or a removal is running: the form's send button waits. */
  readonly onBusy: (busy: boolean) => void;
  readonly disabled?: boolean;
  /** Changes when the form was sent: the list starts again. */
  readonly resetKey?: string;
  readonly ref?: Ref<ScreenshotsHandle>;
}

export function Screenshots({ onIds, onBusy, disabled = false, resetKey, ref }: ScreenshotsProps) {
  const [shots, setShots] = useState<readonly Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seenReset, setSeenReset] = useState(resetKey);
  const previews = useRef<readonly Shot[]>([]);
  useEffect(() => {
    previews.current = shots;
  }, [shots]);
  useEffect(() => () => previews.current.forEach((shot) => URL.revokeObjectURL(shot.url)), []);

  // A sent form leaves the staged ids behind (they are now attached); the picker starts empty for the next one.
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    shots.forEach((shot) => URL.revokeObjectURL(shot.url));
    setShots([]);
    setError(null);
  }

  const settle = (next: readonly Shot[]) => {
    setShots(next);
    onIds(next.map((shot) => shot.id));
  };
  const working = (value: boolean) => {
    setBusy(value);
    onBusy(value);
  };

  const add = async (files: readonly File[]) => {
    const problem = checkAttachments(shots.length, files);
    if (problem !== null) {
      setError(problem);
      return;
    }
    working(true);
    setError(null);
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      const response = await fetch(UPLOAD_PATH, { method: "POST", body });
      const result = uploadResult.safeParse(await response.json());
      if (!response.ok || !result.success || result.data.attachments.length !== files.length) throw new Error("upload-failed");
      settle([...shots, ...files.map((file, index) => ({ key: crypto.randomUUID(), name: file.name, id: result.data.attachments[index]?.id ?? "", url: URL.createObjectURL(file) }))]);
    } catch {
      setError("Screenshots could not be uploaded. You can still send your text, or try the upload again.");
    } finally {
      working(false);
    }
  };

  const remove = async (shot: Shot) => {
    working(true);
    try {
      const response = await fetch(`${UPLOAD_PATH}?attachmentId=${encodeURIComponent(shot.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("remove-failed");
      settle(shots.filter((candidate) => candidate.key !== shot.key));
      URL.revokeObjectURL(shot.url);
      setError(null);
    } catch {
      setError("This screenshot could not be removed. Try again.");
    } finally {
      working(false);
    }
  };

  useImperativeHandle(ref, () => ({ addFiles: (files) => void add(files) }));

  return (
    <div className="flex flex-col gap-2">
      <FileDrop
        chooseLabel={shots.length === 0 ? "Add screenshots" : "Add more"}
        description={`Drop or paste them here. ${ATTACHMENT_HINT}`}
        accept={ATTACHMENT_TYPES.join(",")}
        multiple
        disabled={disabled || busy || shots.length >= ATTACHMENT_LIMIT}
        onFiles={(files) => void add(files)}
      />
      {shots.length === 0 ? null : (
        <ul aria-label="Screenshots to send" className="flex flex-wrap gap-2">
          {shots.map((shot) => (
            <li key={shot.key} className="relative">
              <Image src={shot.url} alt={shot.name} title={shot.name} width={64} height={64} unoptimized className="size-16 rounded-control border border-border object-cover" />
              <button
                type="button"
                aria-label={`Remove ${shot.name}`}
                disabled={disabled || busy}
                onClick={() => void remove(shot)}
                className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full border border-border bg-surface text-ink-3 shadow-pop transition-colors hover:text-ink focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-disabled"
              >
                <Icon name="X" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="type-meta text-neg-text empty:hidden">
        {busy ? "Uploading..." : (error ?? "")}
      </p>
    </div>
  );
}
