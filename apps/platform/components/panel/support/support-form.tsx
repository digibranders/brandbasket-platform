"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent, type ReactElement } from "react";
import type { SupportCategory } from "@firstfold/shared/lib/support";
import { ArrowIcon, CopyIcon, TickIcon } from "@firstfold/shared/ui/icons";
import { Button } from "@firstfold/shared/ui/panel/button";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { createSupportRequest } from "@/app/app-host/(support)/support/actions";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";
import { handleImagePaste } from "@/lib/support-paste";
import { FIELD_CLASSES } from "@/components/panel/form/panel-form";
import { SupportAttachments, type SupportAttachmentsHandle } from "./support-attachments";
import { SupportCategorySelect } from "./support-category-select";

const DETAILS: Partial<Record<SupportCategory, readonly { readonly name: string; readonly label: string }[]>> = {
  bug: [
    { name: "stepsToReproduce", label: "Steps to reproduce" },
    { name: "expectedBehavior", label: "What did you expect?" },
    { name: "actualBehavior", label: "What happened?" },
  ],
  billing: [{ name: "invoiceReference", label: "Invoice or payment reference" }],
  account_access: [{ name: "accountEmail", label: "Email for the affected account" }],
  website_change: [
    { name: "pageUrl", label: "Page to change" },
    { name: "requestedChange", label: "Requested change" },
  ],
};

const SUBJECT_MIN_LENGTH = 3;
const DESCRIPTION_MIN_LENGTH = 10;

/**
 * The server trims a subject and a description before it counts them, so the browser's own minLength (which counts
 * the spaces) is not enough: "   ab" passes it and fails there. A custom validity holds the form's submit button
 * until the trimmed text is long enough.
 */
function requireTrimmedLength(input: HTMLInputElement | HTMLTextAreaElement, min: number, message: string): void {
  input.setCustomValidity(input.value.trim().length < min ? message : "");
}

export function SupportRequestForm({
  initialCategory,
  onDirty,
  onBusy,
  onSent,
  onNavigate,
  onViewTicket,
  onViewAllRequests,
  onSendAnother,
}: {
  readonly initialCategory: "support" | null;
  readonly onDirty: (dirty: boolean) => void;
  readonly onBusy: (busy: boolean) => void;
  readonly onSent: () => void;
  readonly onNavigate: (href: string) => void;
  readonly onViewTicket?: (ticketId: string) => void;
  readonly onViewAllRequests?: () => void;
  readonly onSendAnother?: () => void;
}): ReactElement {
  const [category, setCategory] = useState<SupportCategory | "">(initialCategory ?? "");
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(createSupportRequest, INITIAL_SUPPORT_STATE);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [attachmentIds, setAttachmentIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [technical, setTechnical] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [details, setDetails] = useState<Readonly<Record<string, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const attachmentsRef = useRef<SupportAttachmentsHandle>(null);
  const id = useId();
  const busy = pending || uploading;

  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);

  useEffect(() => {
    if (state.status === "saved") {
      onDirty(false);
      onSent();
      statusRef.current?.focus();
    }
    if (state.status === "error") {
      // The category control is a button; the named field is a hidden input that cannot take focus.
      const field = state.field === null ? null : state.field === "category" ? document.getElementById(`${id}-category`) : formRef.current?.elements.namedItem(state.field);
      if (field instanceof HTMLElement) field.focus();
      else statusRef.current?.focus();
    }
  }, [state, id, onDirty, onSent]);

  const attachmentsChanged = useCallback(
    (ids: readonly string[]): void => {
      setAttachmentIds(ids);
      onDirty(true);
    },
    [onDirty],
  );

  // The one paste handler, on the form: a paste inside the text box bubbles up to it.
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLFormElement>): void => {
      handleImagePaste(
        event,
        (files) => {
          attachmentsRef.current?.addFiles(files);
          onDirty(true);
        },
        "screenshot",
      );
    },
    [onDirty],
  );

  const submitIfValid = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      if (category !== "") return;
      // The action does not run: the category is required and a hidden field cannot ask for it on its own.
      event.preventDefault();
      setCategoryError("Choose a category.");
      document.getElementById(`${id}-category`)?.focus();
    },
    [category, id],
  );

  const handleCopy = useCallback(() => {
    if (state.reference) {
      void navigator.clipboard.writeText(state.reference).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [state.reference]);

  if (state.status === "saved") {
    return (
      <div className="py-6 space-y-6">
        {/* Success Icon & Heading */}
        <div className="space-y-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <TickIcon className="size-6" />
          </div>
          <div>
            <h3
              ref={statusRef}
              tabIndex={-1}
              role="status"
              className="font-serif text-2xl font-medium text-ink outline-none"
            >
              Request received
            </h3>
            <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">
              Thank you for reaching out. Your request is saved. Our team will see it in the console. Replies from our team appear in My requests.
            </p>
          </div>
        </div>

        {/* Reference Code Card */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper-deep/60 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
              Ticket Reference
            </p>
            <p className="font-mono text-sm font-semibold text-ink mt-0.5 select-all">
              {state.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-paper-deep cursor-pointer"
          >
            {copied ? (
              <>
                <TickIcon className="size-3.5 text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5 text-ink-soft" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="cursor-pointer"
            onClick={() => {
              if (state.ticketId && onViewTicket) {
                onViewTicket(state.ticketId);
              } else {
                onNavigate(`/support/${state.ticketId}`);
              }
            }}
          >
            <span>View conversation</span>
            <ArrowIcon className="size-3.5" />
          </Button>

          {onViewAllRequests ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              onClick={onViewAllRequests}
            >
              My requests
            </Button>
          ) : (
            <Link
              href="/support"
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                  event.preventDefault();
                  onNavigate("/support");
                }
              }}
              className="text-xs font-medium text-ink-soft hover:text-ink cursor-pointer"
            >
              All requests
            </Link>
          )}

          {onSendAnother ? (
            <Button
              type="button"
              size="sm"
              variant="quiet"
              className="cursor-pointer"
              onClick={onSendAnother}
            >
              Send another
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} onSubmit={submitIfValid} onChange={() => onDirty(true)} onPaste={handlePaste} className="space-y-5">
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {attachmentIds.map((value) => (
        <input key={value} type="hidden" name="attachmentIds" value={value} />
      ))}

      <div>
        <label htmlFor={`${id}-category`} className="block text-sm font-medium text-ink">
          What can we help with?
          <RequiredMark />
        </label>
        <SupportCategorySelect
          id={`${id}-category`}
          value={category}
          onChange={(val) => {
            setCategory(val);
            setCategoryError(null);
            onDirty(true);
          }}
          disabled={pending}
          required
          hasError={categoryError !== null || state.field === "category"}
          describedBy={categoryError !== null ? `${id}-category-error` : state.field === "category" ? `${id}-status` : undefined}
        />
        {categoryError === null ? null : (
          <p id={`${id}-category-error`} role="alert" className="mt-1.5 text-sm text-accent-deep">
            {categoryError}
          </p>
        )}
      </div>

      <label htmlFor={`${id}-subject`} className="block text-sm font-medium text-ink">
        Subject
        <RequiredMark />
        <input
          id={`${id}-subject`}
          name="subject"
          required
          minLength={SUBJECT_MIN_LENGTH}
          maxLength={120}
          value={subject}
          onChange={(event) => {
            requireTrimmedLength(event.target, SUBJECT_MIN_LENGTH, "Write a subject of at least 3 characters.");
            setSubject(event.target.value);
          }}
          className={FIELD_CLASSES}
          disabled={pending}
          aria-invalid={state.field === "subject"}
          aria-describedby={state.field === "subject" ? `${id}-status` : undefined}
          placeholder="Brief summary of your question or feedback"
        />
      </label>

      <label htmlFor={`${id}-description`} className="block text-sm font-medium text-ink">
        Tell us more
        <RequiredMark />
        <textarea
          id={`${id}-description`}
          name="description"
          required
          minLength={DESCRIPTION_MIN_LENGTH}
          maxLength={5000}
          value={description}
          onChange={(event) => {
            requireTrimmedLength(event.target, DESCRIPTION_MIN_LENGTH, "Tell us a little more (at least 10 characters).");
            setDescription(event.target.value);
          }}
          rows={5}
          className={FIELD_CLASSES}
          disabled={pending}
          aria-invalid={state.field === "description"}
          aria-describedby={state.field === "description" ? `${id}-status` : undefined}
          placeholder="Describe what happened or what you need help with. You can also paste screenshots here."
        />
      </label>

      {category === "website_change" ? (
        <p className="text-sm text-ink-soft">
          We will review the scope and confirm any charges before making changes.
        </p>
      ) : null}

      {category === "billing" || category === "account_access" ? (
        <p className="text-sm text-ink-soft">Please leave out passwords, sign-in codes and card details.</p>
      ) : null}

      {category === "" || DETAILS[category] === undefined ? null : (
        <details className="text-sm text-ink-soft">
          <summary className="cursor-pointer font-medium text-ink">Add details (optional)</summary>
          <div className="mt-3 space-y-3">
            {DETAILS[category]?.map((field) => (
              <label key={field.name} className="block">
                {field.label}
                <textarea
                  name={field.name}
                  value={details[field.name] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDetails((previous) => ({ ...previous, [field.name]: value }));
                  }}
                  maxLength={
                    field.name === "invoiceReference"
                      ? 200
                      : field.name === "accountEmail"
                        ? 320
                        : field.name === "pageUrl"
                          ? 500
                          : 2000
                  }
                  rows={2}
                  className={FIELD_CLASSES}
                  disabled={pending}
                />
              </label>
            ))}
          </div>
        </details>
      )}

      <SupportAttachments ref={attachmentsRef} onChange={attachmentsChanged} onBusy={setUploading} disabled={pending} />

      <label className="flex items-start gap-2.5 text-sm text-ink-soft cursor-pointer">
        <input
          type="checkbox"
          checked={technical}
          onChange={(event) => setTechnical(event.target.checked)}
          disabled={pending}
          className="mt-1 accent-accent cursor-pointer disabled:cursor-not-allowed"
        />
        Include technical details
      </label>

      {technical ? (
        <>
          <p className="text-xs text-ink-soft">
            Includes browser family. Page contents and record identifiers are excluded.
          </p>
          <input
            type="hidden"
            name="browserDevice"
            value={
              /Firefox/.test(navigator.userAgent)
                ? "Firefox"
                : /Edg/.test(navigator.userAgent)
                  ? "Edge"
                  : /Chrome/.test(navigator.userAgent)
                    ? "Chrome"
                    : "Safari or other"
            }
          />
        </>
      ) : null}

      <p ref={statusRef} tabIndex={-1} id={`${id}-status`} role="status" aria-live="polite" className="text-sm text-accent-deep outline-none">
        {state.message}
      </p>

      <SubmitButton size="sm" disabled={busy}>
        {pending ? "Sending…" : uploading ? "Uploading…" : "Send request"}
      </SubmitButton>
    </form>
  );
}
