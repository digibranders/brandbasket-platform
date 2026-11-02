"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ACCEPTED_UPLOAD_TYPES, MAX_PHOTOS, UPLOAD_FILE_NAME_HEADER, type UploadPurpose } from "@brandbasket/shared/lib/uploads/limits";
import { prepareImageForUpload } from "@brandbasket/shared/lib/uploads/prepare-image";
import { sendImage } from "@brandbasket/shared/lib/uploads/send-image";
import { buttonSecondary } from "@/components/console/buttons";
import { hintClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";

const ACCEPT = ACCEPTED_UPLOAD_TYPES.join(",");
/** Under /api/ like the customer's own upload routes, so the body is never copied before the handler runs. */
const UPLOAD_ROUTE = "/api/client-brand-assets";

interface Failure {
  readonly fileName: string;
  readonly message: string;
}

/**
 * Staff add a client's logo and photos here, one request a file, each shrunk in the browser first like the customer's own
 * uploads. A new logo replaces the old one. The page refreshes once the files are sent, so the grid above shows what was stored.
 */
export function ClientBrandUploader({ businessId }: { readonly businessId: string }): ReactElement {
  const router = useRouter();
  const logoInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<UploadPurpose | null>(null);
  const [sent, setSent] = useState(0);
  const [failures, setFailures] = useState<readonly Failure[]>([]);

  async function upload(event: ChangeEvent<HTMLInputElement>, purpose: UploadPurpose): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setSending(purpose);
    setSent(0);
    setFailures([]);
    const failed: Failure[] = [];
    let stored = 0;
    for (const file of files) {
      const body = await prepareImageForUpload(file, purpose);
      const result = await sendImage(`${UPLOAD_ROUTE}?businessId=${businessId}&purpose=${purpose}`, body, {
        [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name),
      });
      if (result.ok) stored += 1;
      else failed.push({ fileName: file.name, message: result.message });
    }
    setSending(null);
    setSent(stored);
    setFailures(failed);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonSecondary} disabled={sending !== null} onClick={() => logoInput.current?.click()}>
          {sending === "logo" ? "Adding logo…" : "Add logo"}
        </button>
        <button type="button" className={buttonSecondary} disabled={sending !== null} onClick={() => photoInput.current?.click()}>
          {sending === "photo" ? "Adding photos…" : "Add photos"}
        </button>
        <input ref={logoInput} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Choose a logo" onChange={(event) => void upload(event, "logo")} />
        <input
          ref={photoInput}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose photos"
          onChange={(event) => void upload(event, "photo")}
        />
      </div>
      <p className={hintClasses}>JPEG, PNG or WebP. A new logo replaces the old one. A business keeps up to {MAX_PHOTOS} photos.</p>
      {sent > 0 ? (
        <Notice tone="ok" className="mt-4">
          {sent === 1 ? "1 file added." : `${sent} files added.`}
        </Notice>
      ) : null}
      {failures.map((failure) => (
        <Notice key={failure.fileName} tone="problem" className="mt-4">
          {failure.fileName}: {failure.message}
        </Notice>
      ))}
    </div>
  );
}
