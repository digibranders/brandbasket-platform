"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type ReactElement } from "react";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { PlusIcon } from "@firstfold/shared/ui/icons";
import { MediaThumbnail } from "@/components/panel/media-thumbnail";
import {
  STEP_FIELD_CLASSES,
  StepFormError,
  StepSubmit,
  useStepForm,
  type StepAction,
  type StepFormControls,
} from "@/components/panel/step-form";
import { MAX_DESCRIPTION_LENGTH, MAX_PHOTOS, photoDescriptionField } from "@/lib/onboarding/brand-form";
import { MAX_UPLOAD_SIZE_LABEL, type UploadPurpose } from "@/lib/uploads/limits";
import { uploadImage, type UploadResult } from "@/lib/uploads/upload-client";

type Purpose = UploadPurpose;
type MediaResult = UploadResult;

export interface UploadedImage {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
  readonly originalFilename: string;
}

interface BrandStepFormProps {
  readonly action: StepAction;
  readonly remove: (mediaId: string) => Promise<MediaResult>;
  readonly logo: UploadedImage | null;
  readonly photos: readonly UploadedImage[];
}

interface FileProblem {
  readonly key: string;
  readonly fileName: string;
  readonly message: string;
}

interface Progress {
  readonly purpose: Purpose;
  readonly done: number;
  readonly total: number;
}

// iPhones convert HEIC photos to JPEG when HEIC is not listed here. Anything else that slips through is converted
// in the browser if it can decode it, and otherwise refused by the server with its own explanation.
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const UNREACHABLE_MESSAGE = "We couldn't upload that file. Check your connection and try again.";
const PICKER_CLASSES =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm transition-colors duration-300 ease-calm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-highlight-deep hover:bg-ink hover:text-paper has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:disabled]:hover:bg-transparent has-[:disabled]:hover:text-ink";
const REMOVE_CLASSES =
  "rounded-full px-3 py-1.5 text-xs text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink disabled:opacity-40";

interface PickerProps {
  readonly purpose: Purpose;
  readonly label: string;
  readonly disabled: boolean;
  readonly onFiles: (purpose: Purpose, files: readonly File[]) => void;
}

/** A file input dressed as a button. It has no name, so the step form never submits the files themselves. */
function FilePicker({ purpose, label, disabled, onFiles }: PickerProps): ReactElement {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onFiles(purpose, files);
  }

  return (
    <label className={PICKER_CLASSES}>
      <PlusIcon className="size-4" />
      {label}
      <input
        type="file"
        accept={ACCEPTED_TYPES}
        multiple={purpose === "photo"}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
    </label>
  );
}

interface PhotoCardProps {
  readonly photo: UploadedImage;
  readonly controls: StepFormControls;
  readonly busy: boolean;
  readonly onRemove: (image: UploadedImage) => void;
}

function PhotoCard({ photo, controls, busy, onRemove }: PhotoCardProps): ReactElement {
  const name = photoDescriptionField(photo.id);
  const id = `field-${name}`;
  return (
    <li className="rounded-control border border-line bg-paper/60 p-3">
      <MediaThumbnail asset={photo} alt={photo.altText ?? ""} />
      <label htmlFor={id} className="mt-3 block text-sm font-medium">
        Describe the photo for people who can’t see it
        <RequiredMark />
      </label>
      <textarea
        id={id}
        name={name}
        rows={2}
        maxLength={MAX_DESCRIPTION_LENGTH}
        placeholder="Our front desk on a sunny morning"
        required
        defaultValue={controls.valueOf(name, photo.altText)}
        className={STEP_FIELD_CLASSES}
        {...controls.fieldStatus(name)}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-ink-soft" title={photo.originalFilename}>
          {photo.originalFilename}
        </span>
        <button type="button" disabled={busy} onClick={() => onRemove(photo)} className={REMOVE_CLASSES}>
          Remove<span className="sr-only"> {photo.originalFilename}</span>
        </button>
      </div>
    </li>
  );
}

/**
 * Step 03. Each chosen file is shrunk in the browser and uploaded on its own as soon as it is picked, and each
 * failure is listed with its file name. The step's own form only carries the photo descriptions; saving it is what
 * completes the step.
 */
export function BrandStepForm({ action, remove, logo, photos }: BrandStepFormProps): ReactElement {
  const router = useRouter();
  const { formRef, errorRef, formAction, controls } = useStepForm(action);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problems, setProblems] = useState<readonly FileProblem[]>([]);
  const busy = progress !== null || removing !== null;
  const photoSlots = Math.max(0, MAX_PHOTOS - photos.length);
  // The server needs a logo or at least one photo before the step can be saved.
  const hasImage = logo !== null || photos.length > 0;

  async function uploadFiles(purpose: Purpose, chosen: readonly File[]): Promise<void> {
    const files = purpose === "logo" ? chosen.slice(0, 1) : chosen;
    const failures: FileProblem[] = [];
    if (purpose === "photo" && files.length > photoSlots) {
      failures.push({
        key: "too-many",
        fileName: `${files.length - photoSlots} of the photos you chose`,
        message: `You can add up to ${MAX_PHOTOS} photos, so these weren’t uploaded.`,
      });
    }
    const accepted = purpose === "photo" ? files.slice(0, photoSlots) : files;

    setProblems([]);
    let stored = 0;
    for (const [index, file] of accepted.entries()) {
      setProgress({ purpose, done: index, total: accepted.length });
      let result: MediaResult;
      try {
        result = await uploadImage(file, purpose);
      } catch {
        result = { ok: false, message: UNREACHABLE_MESSAGE };
      }
      if (result.ok) {
        stored += 1;
      } else {
        failures.push({ key: `${index}-${file.name}`, fileName: file.name, message: result.message });
      }
    }
    setProgress(null);
    setProblems(failures);
    // The route handler cannot refresh this page the way a server action does, so the page asks for fresh data.
    if (stored > 0) router.refresh();
  }

  async function removeImage(image: UploadedImage): Promise<void> {
    setRemoving(image.id);
    setProblems([]);
    let result: MediaResult;
    try {
      result = await remove(image.id);
    } catch {
      result = { ok: false, message: "We couldn’t remove that image. Check your connection and try again." };
    }
    setRemoving(null);
    if (!result.ok) {
      setProblems([{ key: `remove-${image.id}`, fileName: image.originalFilename, message: result.message }]);
    }
  }

  function handleFiles(purpose: Purpose, files: readonly File[]): void {
    void uploadFiles(purpose, files);
  }

  function handleRemove(image: UploadedImage): void {
    void removeImage(image);
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-8">
      <section aria-labelledby="brand-logo-heading" className="space-y-3">
        <h3 id="brand-logo-heading" className="panel-section">
          Your logo <span className="font-sans text-sm text-ink-soft">(optional)</span>
        </h3>
        <p className="text-sm text-ink-soft">No logo yet? That’s fine, we’ll set your name in a clean typeface.</p>
        {logo === null ? null : (
          <div className="flex items-end gap-4">
            <div className="w-44">
              <MediaThumbnail asset={logo} alt="Your logo" fit="contain" />
            </div>
            <button type="button" disabled={busy} onClick={() => handleRemove(logo)} className={REMOVE_CLASSES}>
              Remove logo
            </button>
          </div>
        )}
        <FilePicker
          purpose="logo"
          label={logo === null ? "Upload your logo" : "Replace your logo"}
          disabled={busy}
          onFiles={handleFiles}
        />
      </section>

      <section aria-labelledby="brand-photos-heading" className="space-y-3">
        <h3 id="brand-photos-heading" className="panel-section">
          Photos
        </h3>
        <p className="text-sm text-ink-soft">
          Your place, your team, your work. Up to {MAX_PHOTOS} JPEG, PNG or WebP images. We shrink large photos
          before sending them, and each needs to come to {MAX_UPLOAD_SIZE_LABEL} or less. You have {photos.length} of{" "}
          {MAX_PHOTOS}.
        </p>
        {photos.length === 0 ? null : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} controls={controls} busy={busy} onRemove={handleRemove} />
            ))}
          </ul>
        )}
        <FilePicker purpose="photo" label="Add photos" disabled={busy || photoSlots === 0} onFiles={handleFiles} />
      </section>

      <p aria-live="polite" className="text-sm text-ink-soft empty:hidden">
        {progress === null
          ? removing === null
            ? ""
            : "Removing…"
          : progress.total === 1
            ? "Uploading…"
            : `Uploading ${progress.done + 1} of ${progress.total}…`}
      </p>

      {problems.length === 0 ? null : (
        <ul role="alert" className="space-y-2 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {problems.map((problem) => (
            <li key={problem.key}>
              <span className="font-medium">{problem.fileName}:</span> {problem.message}
            </li>
          ))}
        </ul>
      )}

      <StepFormError controls={controls} errorRef={errorRef} />
      {hasImage ? null : <p className="text-sm text-ink-soft">Add your logo or at least one photo to continue.</p>}
      <StepSubmit controls={controls} label="Save and continue" pendingLabel="Saving…" disabled={!hasImage} />
    </form>
  );
}
