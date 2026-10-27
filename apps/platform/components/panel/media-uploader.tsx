"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type ReactElement } from "react";
import { PlusIcon } from "@brandbasket/shared/ui/icons";
import { MediaThumbnail } from "@/components/panel/media-thumbnail";
import {
  InlineError,
  Required,
  STEP_BODY_CLASSES,
  STEP_FIELD_CLASSES,
  STEP_HINT_CLASSES,
  STEP_LABEL_CLASSES,
  StepFooter,
  StepFormError,
  StepGroup,
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
  "inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg bg-sunken px-4 text-[0.8125rem] font-semibold text-ink transition-colors duration-200 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rattan hover:bg-line has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 has-[:disabled]:hover:bg-sunken";
const REMOVE_CLASSES =
  "rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink disabled:opacity-45";

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
    <li className="min-w-0">
      <MediaThumbnail asset={photo} alt={photo.altText ?? ""} />
      <label htmlFor={id} className={`mt-3 ${STEP_LABEL_CLASSES}`}>
        Describe the photo for people who can’t see it
        <Required />
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
      <InlineError controls={controls} match={name} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-ink-2" title={photo.originalFilename}>
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
  const { formRef, errorRef, formAction, controls } = useStepForm(action, { inline: true });
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
    <form ref={formRef} action={formAction} noValidate className="group/step">
      <div className={STEP_BODY_CLASSES}>
        <StepGroup title="Your logo">
          <p className={STEP_HINT_CLASSES}>
            <span className="font-medium">(optional)</span> No logo yet? That’s fine, we’ll set your name in a clean typeface.
          </p>
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
        </StepGroup>

        <StepGroup title="Photos">
          <p className={STEP_HINT_CLASSES}>
            Your place, your team, your work. Up to {MAX_PHOTOS} JPEG, PNG or WebP images. We shrink large photos
            before sending them, and each needs to come to {MAX_UPLOAD_SIZE_LABEL} or less. You have {photos.length} of{" "}
            {MAX_PHOTOS}.
          </p>
          {photos.length === 0 ? null : (
            <ul className="grid gap-x-5 gap-y-6 sm:grid-cols-2 @3xl:grid-cols-3">
              {photos.map((photo) => (
                <PhotoCard key={photo.id} photo={photo} controls={controls} busy={busy} onRemove={handleRemove} />
              ))}
            </ul>
          )}
          <FilePicker purpose="photo" label="Add photos" disabled={busy || photoSlots === 0} onFiles={handleFiles} />
        </StepGroup>

        <p aria-live="polite" className="text-sm text-ink-2 empty:hidden">
          {progress === null
            ? removing === null
              ? ""
              : "Removing…"
            : progress.total === 1
              ? "Uploading…"
              : `Uploading ${progress.done + 1} of ${progress.total}…`}
        </p>

        {problems.length === 0 ? null : (
          <ul role="alert" className="grid gap-2 rounded-lg bg-sunken px-4 py-3 text-sm text-error">
            {problems.map((problem) => (
              <li key={problem.key}>
                <span className="font-semibold">{problem.fileName}:</span> {problem.message}
              </li>
            ))}
          </ul>
        )}

        <StepFormError controls={controls} errorRef={errorRef} />
        {hasImage ? null : <p className="text-sm text-ink-2">Add your logo or at least one photo to continue.</p>}
      </div>
      <StepFooter controls={controls} label="Save and continue" pendingLabel="Saving…" step="brand" note="Saved when you continue." disabled={!hasImage} />
    </form>
  );
}
