"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactElement } from "react";
import { Button } from "@fynix/shared/ui/panel/button";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { cn } from "@fynix/shared/lib/cn";
import type { AuthorFormResult } from "@/app/app-host/(protected)/content/authors/actions";
import {
  AUTHOR_LINK_KINDS,
  AUTHOR_LINK_LABELS,
  AUTHOR_LINK_PLACEHOLDERS,
  type AuthorLinkKind,
} from "@/lib/author-links";
import {
  AUTHOR_BIO_MAX_LENGTH,
  AUTHOR_NAME_MAX_LENGTH,
  AUTHOR_ROLE_MAX_LENGTH,
  type BlogAuthorFields,
} from "@/lib/blog-author-fields";
import type { BlogAuthorWithStats } from "@/lib/server/blog-taxonomy";
import { uploadContentMedia } from "@/lib/uploads/content-media-upload-client";
import { ACCEPTED_UPLOAD_TYPES, isAcceptedUploadType, MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "@/lib/uploads/limits";
import { AuthorAvatar } from "./author-avatar";
import { Counter, INPUT_CLASS, PostDate, SidebarSection } from "./parts";

/** The longest link the server stores (lib/author-links.ts). */
const MAX_LINK_LENGTH = 300;

interface AuthorEditorProps {
  readonly author: BlogAuthorWithStats;
  readonly save: (authorId: string, fields: BlogAuthorFields) => Promise<AuthorFormResult>;
  readonly setPhoto: (authorId: string, mediaId: string) => Promise<AuthorFormResult>;
  readonly removePhoto: (authorId: string) => Promise<AuthorFormResult>;
  readonly remove: (authorId: string) => Promise<AuthorFormResult>;
}

function fieldsOf(author: BlogAuthorWithStats): BlogAuthorFields {
  const links = Object.fromEntries(AUTHOR_LINK_KINDS.map((kind) => [kind, author.links[kind] ?? ""])) as Record<
    AuthorLinkKind,
    string
  >;
  return { name: author.name, role: author.role ?? "", bio: author.bio ?? "", links };
}

function same(a: BlogAuthorFields, b: BlogAuthorFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The photo: a round preview with upload, replace and remove. It saves on its own, straight after the upload. */
function PhotoField({
  author,
  setPhoto,
  removePhoto,
  onError,
}: {
  readonly author: BlogAuthorWithStats;
  readonly setPhoto: AuthorEditorProps["setPhoto"];
  readonly removePhoto: AuthorEditorProps["removePhoto"];
  readonly onError: (message: string | null) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function choose(file: File): void {
    onError(null);
    if (!isAcceptedUploadType(file.type)) return onError("Choose a JPEG, PNG or WEBP image.");
    if (file.size > MAX_UPLOAD_BYTES) return onError(TOO_LARGE_MESSAGE);
    startTransition(async () => {
      const uploaded = await uploadContentMedia(file);
      if (!uploaded.ok) return onError(uploaded.message);
      const result = await setPhoto(author.id, uploaded.mediaId);
      if (!result.ok) onError(result.message);
    });
  }

  const button =
    "rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors duration-200 ease-calm hover:bg-paper-deep disabled:opacity-60";

  return (
    <div className="flex items-center gap-5">
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
      <AuthorAvatar name={author.name} photoUrl={author.photo?.url ?? null} size={88} className="ring-1 ring-line" />
      <div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending} onClick={() => inputRef.current?.click()} className={button}>
            {isPending ? "Uploading…" : author.photo === null ? "Upload photo" : "Replace"}
          </button>
          {author.photo === null ? null : (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removePhoto(author.id);
                  onError(result.ok ? null : result.message);
                })
              }
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors duration-200 ease-calm hover:bg-accent-pale hover:text-accent-deep disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-soft">A clear, square photo of their face works best. JPEG, PNG or WEBP.</p>
      </div>
    </div>
  );
}

/**
 * One author, the way the reference CMS lays it out: who they are on the left (name, photo, role, bio, links), and
 * what they have written on the right. Only what a small business needs; nothing here asks for SEO work.
 */
export function AuthorEditor({ author, save, setPhoto, removePhoto, remove }: AuthorEditorProps): ReactElement {
  const [fields, setFields] = useState<BlogAuthorFields>(() => fieldsOf(author));
  const [saved, setSaved] = useState<BlogAuthorFields>(() => fieldsOf(author));
  const [lastSent, setLastSent] = useState<BlogAuthorFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // After a save the page's data refreshes with what was stored (trimmed, links completed). Take it in unless the
  // customer has typed since.
  const [syncedAt, setSyncedAt] = useState(author.updatedAt);
  if (author.updatedAt !== syncedAt) {
    setSyncedAt(author.updatedAt);
    const fresh = fieldsOf(author);
    if (same(fields, saved) || (lastSent !== null && same(fields, lastSent))) setFields(fresh);
    setSaved(fresh);
  }
  const dirty = !same(fields, saved);
  // The server refuses an author with no name, so Save waits for one.
  const hasName = fields.name.trim() !== "";

  const runSave = useCallback(() => {
    setError(null);
    setLastSent(fields);
    const sent = fields;
    startTransition(async () => {
      const result = await save(author.id, sent);
      if (!result.ok) setError(result.message);
    });
  }, [author.id, fields, save]);

  const runSaveRef = useRef(runSave);
  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        runSaveRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const setLink = (kind: AuthorLinkKind, value: string): void =>
    setFields((current) => ({ ...current, links: { ...current.links, [kind]: value } }));

  return (
    <div className="-mt-4">
      <div className="sticky top-0 z-30 -mx-5 border-b border-line/70 bg-paper/90 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/content/authors"
              className="shrink-0 text-sm text-ink-soft transition-colors duration-200 ease-calm hover:text-ink"
            >
              ← Authors
            </Link>
            <AuthorAvatar name={fields.name || author.name} photoUrl={author.photo?.url ?? null} size={28} />
            <p className="min-w-0 truncate font-serif text-lg text-ink">{fields.name || "Unnamed author"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-soft">{isPending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
            <Button type="button" size="sm" disabled={isPending || !dirty || !hasName} onClick={runSave} className="h-10">
              Save
            </Button>
          </div>
        </div>
        {error === null ? null : (
          <p role="alert" className="mt-3 text-sm text-accent-deep">
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-14">
        <div className="min-w-0 max-w-2xl space-y-7">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
              Name
              <RequiredMark />
            </label>
            <RuleInput
              id="name"
              rule="personName"
              required
              value={fields.name}
              maxLength={AUTHOR_NAME_MAX_LENGTH}
              onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <p className="mb-2.5 text-[0.8125rem] font-semibold text-ink">Photo</p>
            <PhotoField author={author} setPhoto={setPhoto} removePhoto={removePhoto} onError={setError} />
          </div>

          <div>
            <label htmlFor="role" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
              Role
            </label>
            <input
              id="role"
              value={fields.role}
              maxLength={AUTHOR_ROLE_MAX_LENGTH}
              placeholder="e.g. Head physiotherapist"
              onChange={(event) => setFields((current) => ({ ...current, role: event.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="bio" className="text-[0.8125rem] font-semibold text-ink">
                Short bio
              </label>
              <Counter value={fields.bio.length} max={AUTHOR_BIO_MAX_LENGTH} />
            </div>
            <textarea
              id="bio"
              rows={3}
              value={fields.bio}
              maxLength={AUTHOR_BIO_MAX_LENGTH}
              placeholder="One or two lines about them, shown under their posts."
              onChange={(event) => setFields((current) => ({ ...current, bio: event.target.value.replace(/\n/g, " ") }))}
              className={cn(INPUT_CLASS, "resize-none")}
            />
          </div>

          <fieldset>
            <legend className="text-[0.8125rem] font-semibold text-ink">Links</legend>
            <div className="mt-2.5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {AUTHOR_LINK_KINDS.map((kind) => (
                <div key={kind}>
                  <label htmlFor={`link-${kind}`} className="mb-1 block text-xs text-ink-soft">
                    {AUTHOR_LINK_LABELS[kind]}
                  </label>
                  <input
                    id={`link-${kind}`}
                    value={fields.links[kind]}
                    inputMode="url"
                    maxLength={MAX_LINK_LENGTH}
                    spellCheck={false}
                    autoCapitalize="none"
                    placeholder={AUTHOR_LINK_PLACEHOLDERS[kind]}
                    onChange={(event) => setLink(kind, event.target.value)}
                    className={cn(INPUT_CLASS, "py-2 text-sm")}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-32 lg:self-start">
          <SidebarSection title="Writing">
            <p className="font-serif text-3xl tabular-nums text-ink">{author.publishedCount}</p>
            <p className="text-sm text-ink-soft">
              published {author.publishedCount === 1 ? "post" : "posts"}
              {author.draftCount > 0 ? ` · ${author.draftCount} in draft` : null}
            </p>
            <p className="mt-3 text-xs text-ink-soft">
              {author.lastPublishedAt === null ? (
                "Nothing published yet."
              ) : (
                <>
                  Most recent: <PostDate time={author.lastPublishedAt} />
                </>
              )}
            </p>
          </SidebarSection>
          <SidebarSection title="Remove">
            <p className="text-xs text-ink-soft">Their posts stay on your website, just without an author.</p>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Delete ${author.name}? Their posts stay, without an author.`)) return;
                startTransition(async () => {
                  const result = await remove(author.id);
                  if (!result.ok) setError(result.message);
                });
              }}
              className="mt-3 rounded-full px-3.5 py-1.5 text-xs font-semibold text-accent-deep ring-1 ring-accent/20 transition-colors duration-200 ease-calm hover:bg-accent-pale disabled:opacity-60"
            >
              Delete author
            </button>
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}
