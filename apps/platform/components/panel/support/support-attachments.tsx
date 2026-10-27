"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactElement, type ReactNode } from "react";
import { z } from "zod";
import { SUPPORT_ATTACHMENT_LIMIT, SUPPORT_ATTACHMENT_MAX_BYTES } from "@brandbasket/shared/lib/support";
import { Image as ImageIcon, Paperclip, X } from "@phosphor-icons/react/dist/ssr";
import { SOFT_BUTTON } from "@/components/v2/classes";

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

const HELPER = "Up to 3 images, 4 MB each (PNG, JPEG, WebP). Hide any personal information before uploading.";

const uploadResult = z.object({
  attachments: z.array(z.object({ id: z.uuid() })).min(1).max(SUPPORT_ATTACHMENT_LIMIT),
});

export const SupportAttachments = forwardRef<
  SupportAttachmentsHandle,
  {
    readonly onChange: (ids: readonly string[]) => void;
    readonly onBusy: (busy: boolean) => void;
    readonly disabled?: boolean;
    /**
     * The one-line variant for a reply bar: the picker is a paperclip button inside the bar, `children` (the field and the send
     * button) sit beside it, attached images are small chips above, and the size and privacy note shows only while an image is
     * attached or the paperclip has focus. Without it the widget keeps the full block the Ask for a change form uses.
     */
    readonly compact?: boolean;
    readonly children?: ReactNode;
  }
>(function SupportAttachments({ onChange, onBusy, disabled = false, compact = false, children }, ref): ReactElement {
  const [previews, setPreviews] = useState<readonly Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachFocused, setAttachFocused] = useState(false);
  const helperId = useId();

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

  const fileInput = (
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
  );
  const progress = (
    <p role="status" aria-live="polite" className={compact ? "text-sm text-error empty:hidden" : "text-sm text-error"}>
      {busy ? "Uploading screenshots…" : error ?? ""}
    </p>
  );

  if (compact) {
    const showHelper = previews.length > 0 || attachFocused;
    return (
      <div className="grid gap-2">
        {previews.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {previews.map((item) => (
              <li
                key={item.key}
                title={item.error ?? item.name}
                className={`flex h-8 max-w-full items-center gap-2 rounded-lg bg-sunken pl-1 pr-1 text-xs ${item.error === null ? "text-ink" : "text-error"}`}
              >
                {/* Object URLs are local previews. Uploaded screenshots never have public URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="size-6 shrink-0 rounded-md object-cover" />
                <span className="min-w-0 max-w-40 truncate">{item.id === null && item.error === null ? "Uploading…" : item.name}</span>
                <button
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => void remove(item)}
                  aria-label={`Remove screenshot ${item.name}`}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors duration-200 hover:bg-line hover:text-ink motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50"
                >
                  <X size={12} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {progress}
        <div className="flex items-end gap-2">
          {fileInput}
          <button
            type="button"
            disabled={busy || disabled || reachedLimit}
            onClick={() => fileInputRef.current?.click()}
            onFocus={() => setAttachFocused(true)}
            onBlur={() => setAttachFocused(false)}
            aria-label="Attach screenshots"
            aria-describedby={showHelper ? helperId : undefined}
            title="Attach screenshots"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          {children}
        </div>
        {showHelper ? (
          <p id={helperId} className="text-xs text-ink-2">
            {reachedLimit ? "Maximum 3 screenshots attached. " : ""}
            {HELPER}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-[0.8125rem] font-semibold text-ink">
          Screenshots <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <span className="text-xs tabular-nums text-ink-2">
          {previews.length}/{SUPPORT_ATTACHMENT_LIMIT}
        </span>
      </div>

      {fileInput}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || disabled || reachedLimit}
          onClick={() => fileInputRef.current?.click()}
          className={`${SOFT_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <ImageIcon size={16} aria-hidden="true" />
          <span>{previews.length === 0 ? "Choose files" : "Add more"}</span>
        </button>
        <span className="text-xs text-ink-2">
          {reachedLimit ? "Maximum 3 screenshots attached" : "or paste screenshots from clipboard"}
        </span>
      </div>

      {previews.length > 0 ? (
        <ul className="flex flex-wrap gap-3 pt-1">
          {previews.map((item) => (
            <li key={item.key} className="w-28">
              <div className="relative h-20 w-28 overflow-hidden rounded-control bg-sunken">
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
                  className="absolute right-1.5 top-1.5 z-20 flex size-5 items-center justify-center rounded-full bg-ink/80 text-paper backdrop-blur-xs transition-transform hover:scale-110 hover:bg-ink active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => void remove(item)}
                  aria-label={`Remove screenshot ${item.name}`}
                  title={`Remove ${item.name}`}
                >
                  <X size={10} weight="bold" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 truncate text-xs text-ink-2" title={item.name}>
                {item.name}
              </p>
              {item.error === null ? null : (
                <p className="mt-0.5 text-xs text-error leading-tight">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-ink-2">{HELPER}</p>
      {progress}
    </div>
  );
});
