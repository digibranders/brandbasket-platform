"use client";

import { useState } from "react";
import { z } from "zod";
import { formatBytes } from "@/lib/format";
import { FileDrop, IconButton } from "@/ui";
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
  readonly size: number;
  readonly id: string;
}

export interface ScreenshotsProps {
  /** The staged ids, for the form's hidden fields. */
  readonly onIds: (ids: readonly string[]) => void;
  /** True while an upload or a removal is running: the form's send button waits. */
  readonly onBusy: (busy: boolean) => void;
  readonly disabled?: boolean;
  /** Changes when the form was sent: the list starts again. */
  readonly resetKey?: string;
}

export function Screenshots({ onIds, onBusy, disabled = false, resetKey }: ScreenshotsProps) {
  const [shots, setShots] = useState<readonly Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seenReset, setSeenReset] = useState(resetKey);

  // A sent form leaves the staged ids behind (they are now attached); the picker starts empty for the next one.
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
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
      settle([...shots, ...files.map((file, index) => ({ key: crypto.randomUUID(), name: file.name, size: file.size, id: result.data.attachments[index]?.id ?? "" }))]);
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
      setError(null);
    } catch {
      setError("This screenshot could not be removed. Try again.");
    } finally {
      working(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <FileDrop
        chooseLabel={shots.length === 0 ? "Add screenshots" : "Add more"}
        description={ATTACHMENT_HINT}
        accept={ATTACHMENT_TYPES.join(",")}
        multiple
        disabled={disabled || busy || shots.length >= ATTACHMENT_LIMIT}
        onFiles={(files) => void add(files)}
      />
      {shots.length === 0 ? null : (
        <ul aria-label="Screenshots to send" className="flex flex-col divide-y divide-border-subtle rounded-control border border-border">
          {shots.map((shot) => (
            <li key={shot.key} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate type-body">{shot.name}</span>
              <span className="type-meta">{formatBytes(shot.size)}</span>
              <IconButton icon="X" label={`Remove ${shot.name}`} disabled={disabled || busy} onClick={() => void remove(shot)} />
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
