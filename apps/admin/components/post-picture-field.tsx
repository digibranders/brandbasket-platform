"use client";

import { useState, type ReactElement } from "react";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { POST_PICTURE_MAX_BYTES, POST_PICTURE_WIDTH } from "@/lib/deliverable-form";
import { encodeWithin } from "@/lib/staff-ad-crop";

const OUTPUT_TYPE = "image/webp";

interface PostPictureFieldProps {
  /** The form field the shrunk picture posts under. */
  readonly name: string;
  readonly id?: string;
}

function toFile(canvas: HTMLCanvasElement, quality: number, fileName: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob === null ? null : new File([blob], fileName, { type: OUTPUT_TYPE })), OUTPUT_TYPE, quality);
  });
}

/** The chosen picture with its long side at most 1080 pixels, as WebP; null when the browser cannot read or encode it. */
async function shrink(file: File): Promise<File | null> {
  // `from-image` applies the photo's own rotation, as the server does.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, POST_PICTURE_WIDTH / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (context === null) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const name = `${file.name.replace(/\.[^.]*$/, "") || "picture"}.webp`;
  return encodeWithin((quality) => toFile(canvas, quality, name), undefined, POST_PICTURE_MAX_BYTES);
}

/**
 * The picture for a social post: a file input that shrinks the chosen file in the browser before the form posts, so the
 * server action's 1 MB body limit is never hit. The server fits it again whatever arrives (lib/server/post-picture.ts).
 */
export function PostPictureField({ name, id = "post-picture" }: PostPictureFieldProps): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    setProblem(null);
    if (file === undefined) return;
    let small: File | null = null;
    try {
      small = await shrink(file);
    } catch {
      small = null;
    }
    if (small === null || small.size > POST_PICTURE_MAX_BYTES) {
      input.value = "";
      setProblem("That file could not be used as a picture. Try a JPEG, PNG or WebP.");
      return;
    }
    const files = new DataTransfer();
    files.items.add(small);
    input.files = files.files;
  }

  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        Picture <span className="text-ink-soft">(optional)</span>
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void choose(event.currentTarget)}
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={problem === null ? undefined : `${id}-error`}
        className={`${fieldClasses} file:mr-4 file:rounded-full file:border-0 file:bg-paper-deep file:px-4 file:py-1.5 file:text-sm file:font-medium`}
      />
      <p className={hintClasses}>JPEG, PNG or WebP.</p>
      {problem === null ? null : (
        <p id={`${id}-error`} role="alert" className="mt-2 border-l-2 border-accent py-0.5 pl-3 text-sm text-accent">
          {problem}
        </p>
      )}
    </div>
  );
}
