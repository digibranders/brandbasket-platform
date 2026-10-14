"use client";

import Image from "next/image";
import { useRef, useState, useTransition, type ReactElement } from "react";
import type { BlogFormResult } from "@/app/app-host/(protected)/content/blog/actions";
import type { BlogPostImage } from "@/lib/server/blog";
import { uploadContentMedia } from "@/lib/uploads/content-media-upload-client";
import { ACCEPTED_UPLOAD_TYPES, isAcceptedUploadType, MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "@/lib/uploads/limits";
import { INPUT_CLASS } from "./parts";

interface CoverImageFieldProps {
  readonly postId: string;
  readonly image: BlogPostImage | null;
  readonly alt: string;
  readonly onAltChange: (alt: string) => void;
  readonly setCoverImage: (postId: string, mediaId: string) => Promise<BlogFormResult>;
  readonly removeCoverImage: (postId: string) => Promise<BlogFormResult>;
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The post's cover image: pick one (it uploads and attaches at once, like the reference CMS), replace it, remove it,
 * and describe it. The description saves with the rest of the post; the image itself saves immediately, because an
 * upload that waited for Save would be lost on a reload.
 */
export function CoverImageField({
  postId,
  image,
  alt,
  onAltChange,
  setCoverImage,
  removeCoverImage,
}: CoverImageFieldProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(file: File): void {
    setError(null);
    if (!isAcceptedUploadType(file.type)) {
      setError("Choose a JPEG, PNG or WEBP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(TOO_LARGE_MESSAGE);
      return;
    }
    startTransition(async () => {
      const uploaded = await uploadContentMedia(file);
      if (!uploaded.ok) {
        setError(uploaded.message);
        return;
      }
      const result = await setCoverImage(postId, uploaded.mediaId);
      if (!result.ok) setError(result.message);
    });
  }

  function remove(): void {
    setError(null);
    startTransition(async () => {
      const result = await removeCoverImage(postId);
      if (result.ok) onAltChange("");
      else setError(result.message);
    });
  }

  const details = image === null ? null : [
    image.width > 0 && image.height > 0 ? `${image.width} × ${image.height}` : null,
    formatBytes(image.filesize),
    image.mimeType?.replace("image/", "").toUpperCase() ?? null,
  ].filter((part): part is string => part !== null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) choose(file);
        }}
      />

      {image === null ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-ink-soft/35 bg-card px-6 py-9 text-center transition-colors duration-200 ease-calm hover:border-accent hover:bg-accent-pale/40 disabled:opacity-60"
        >
          <span className="text-sm font-semibold text-ink">{isPending ? "Uploading…" : "Add a cover image"}</span>
          <span className="text-xs text-ink-soft">JPEG, PNG or WEBP. Shown at the top of the post and when it’s shared.</span>
        </button>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Image
            src={image.url}
            alt={alt}
            width={240}
            height={135}
            unoptimized
            className="aspect-video w-full shrink-0 rounded-control bg-paper-deep object-cover sm:w-60"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{image.filename ?? "Cover image"}</p>
            {details === null || details.length === 0 ? null : (
              <p className="mt-0.5 text-xs text-ink-soft">{details.join(" · ")}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => inputRef.current?.click()}
                className="rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors duration-200 ease-calm hover:bg-paper-deep disabled:opacity-60"
              >
                {isPending ? "Working…" : "Replace"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={remove}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors duration-200 ease-calm hover:bg-accent-pale hover:text-accent-deep disabled:opacity-60"
              >
                Remove
              </button>
            </div>
            <label htmlFor="coverImageAlt" className="mt-4 block text-xs font-semibold text-ink">
              Describe the image
            </label>
            <input
              id="coverImageAlt"
              value={alt}
              maxLength={250}
              placeholder="e.g. A bowl of dal with fresh coriander"
              onChange={(event) => onAltChange(event.target.value)}
              className={`${INPUT_CLASS} mt-1.5 py-2 text-sm`}
            />
          </div>
        </div>
      )}

      {error === null ? null : (
        <p role="alert" className="mt-2 text-sm text-accent-deep">
          {error}
        </p>
      )}
    </div>
  );
}
