"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement } from "react";
import { z } from "zod";
import { SUPPORT_ATTACHMENT_LIMIT, SUPPORT_ATTACHMENT_MAX_BYTES } from "@fynix/shared/lib/support";
import { PhotoIcon } from "@fynix/shared/ui/icons";

export interface SupportAttachmentsHandle {
  readonly addFiles: (files: readonly File[] | FileList) => void;
}

interface Preview {
  readonly key: string;
  readonly name: string;
  readonly url: string;
  readonly id: string | null;
  readonly error: string | null;
}

const uploadResult = z.object({
  attachments: z.array(z.object({ id: z.uuid() })).min(1).max(SUPPORT_ATTACHMENT_LIMIT),
});

export const SupportAttachments = forwardRef<
  SupportAttachmentsHandle,
  {
    readonly onChange: (ids: readonly string[]) => void;
    readonly onBusy: (busy: boolean) => void;
    readonly disabled?: boolean;
  }
>(function SupportAttachments({ onChange, onBusy, disabled = false }, ref): ReactElement {
  const [previews, setPreviews] = useState<readonly Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const allocated = urls.current;
    return () => {
      for (const url of allocated) URL.revokeObjectURL(url);
    };
  }, []);

  const upload = useCallback(
    async (files: readonly File[] | FileList | null): Promise<void> => {
      if (files === null || busy) return;
      const selected = Array.from(files);
      if (selected.length === 0) return;

      if (
        selected.length + previews.length > SUPPORT_ATTACHMENT_LIMIT ||
        selected.some(
          (file) =>
            file.size > SUPPORT_ATTACHMENT_MAX_BYTES ||
            !["image/png", "image/jpeg", "image/webp"].includes(file.type),
        )
      ) {
        setError("Choose up to three PNG, JPEG or WebP screenshots, each at most 4 MB.");
        return;
      }

      setBusy(true);
      onBusy(true);
      setError(null);

      const additions = selected.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { key: crypto.randomUUID(), name: file.name, url, id: null, error: null };
      });

      const nextPreviews = [...previews, ...additions];
      setPreviews(nextPreviews);

      try {
        const body = new FormData();
        for (const file of selected) body.append("files", file);
        const response = await fetch("/api/support-uploads", { method: "POST", body });
        const payload: unknown = await response.json();
        const result = uploadResult.safeParse(payload);
        if (!response.ok || !result.success || result.data.attachments.length !== additions.length) {
          throw new Error("upload-failed");
        }
        const ready = additions.map((item, index) => ({
          ...item,
          id: result.data.attachments[index]?.id ?? null,
        }));
        const all = [...previews, ...ready];
        setPreviews(all);
        onChange(all.flatMap((item) => (item.id === null ? [] : [item.id])));
      } catch {
        setPreviews([
          ...previews,
          ...additions.map((item) => ({
            ...item,
            error: "Upload failed. This screenshot will not be sent.",
          })),
        ]);
        setError(
          "Screenshots could not be uploaded. You can still send your text or remove these images and try uploading again.",
        );
      } finally {
        setBusy(false);
        onBusy(false);
      }
    },
    [busy, onBusy, onChange, previews],
  );

  useImperativeHandle(
    ref,
    () => ({
      addFiles: (files: readonly File[] | FileList) => {
        void upload(files);
      },
    }),
    [upload],
  );

  async function remove(item: Preview): Promise<void> {
    if (item.id !== null) {
      setBusy(true);
      onBusy(true);
      try {
        const response = await fetch(`/api/support-uploads?attachmentId=${encodeURIComponent(item.id)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          setError("This screenshot could not be removed. Try again.");
          return;
        }
      } catch {
        setError("This screenshot could not be removed. Try again.");
        return;
      } finally {
        setBusy(false);
        onBusy(false);
      }
    }
    URL.revokeObjectURL(item.url);
    urls.current.delete(item.url);
    const next = previews.filter((value) => value.key !== item.key);
    setPreviews(next);
    onChange(next.flatMap((value) => (value.id === null ? [] : [value.id])));
    setError(null);
  }

  const reachedLimit = previews.length >= SUPPORT_ATTACHMENT_LIMIT;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-ink">
          Screenshots <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <span className="text-xs tabular-nums text-ink-soft">
          {previews.length}/{SUPPORT_ATTACHMENT_LIMIT}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        disabled={busy || disabled || reachedLimit}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void upload(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || disabled || reachedLimit}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-control border border-ink-soft/50 bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:border-ink hover:bg-paper-deep focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PhotoIcon className="size-3.5 text-ink-soft" />
          <span>{previews.length === 0 ? "Choose files" : "Add more"}</span>
        </button>
        <span className="text-xs text-ink-soft">
          {reachedLimit ? "Maximum 3 screenshots attached" : "or paste screenshots from clipboard"}
        </span>
      </div>

      {previews.length > 0 ? (
        <ul className="flex flex-wrap gap-3 pt-1">
          {previews.map((item) => (
            <li key={item.key} className="w-28">
              <div className="relative h-20 w-28 overflow-hidden rounded-control border border-line bg-paper-deep shadow-xs">
                {/* Object URLs are local previews. Uploaded screenshots never have public URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={`Screenshot preview: ${item.name}`}
                  className="h-full w-full object-cover"
                />
                {item.id === null && item.error === null ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/75 backdrop-blur-[1px]">
                    <span className="text-[11px] font-medium text-ink">Uploading…</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={busy || disabled}
                  className="absolute right-1.5 top-1.5 z-20 flex size-5 items-center justify-center rounded-full bg-ink/80 text-paper shadow-sm backdrop-blur-xs transition-transform hover:scale-110 hover:bg-ink active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => void remove(item)}
                  aria-label={`Remove screenshot ${item.name}`}
                  title={`Remove ${item.name}`}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-2.5"
                  >
                    <path d="m4 4 8 8m0-8-8 8" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 truncate text-xs text-ink-soft" title={item.name}>
                {item.name}
              </p>
              {item.error === null ? null : (
                <p className="mt-0.5 text-xs text-accent-deep leading-tight">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-ink-soft">
        Up to 3 images, 4 MB each (PNG, JPEG, WebP). Hide any personal information before uploading.
      </p>
      <p role="status" aria-live="polite" className="text-sm text-accent-deep">
        {busy ? "Uploading screenshots…" : error ?? ""}
      </p>
    </div>
  );
});
