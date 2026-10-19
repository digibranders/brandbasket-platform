"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { cn } from "@brandbasket/shared/lib/cn";
import type { BlogFormResult, BlogPostFields, BlogSaveIntent } from "@/app/app-host/(protected)/content/blog/actions";
import type { TaxonomyOption, TaxonomyResult } from "@/app/app-host/(protected)/content/blog/taxonomy-actions";
import {
  fieldsFromPost,
  fromLocalInputValue,
  sameFields,
  toBlogPostFields,
  type EditorFields,
} from "@/lib/blog-editor-fields";
import { blogPublishState } from "@/lib/blog-publish-state";
import { resolveSeo } from "@/lib/blog-seo";
import { seoHealth } from "@/lib/blog-seo-health";
import { lexicalOutline, lexicalToPlainText } from "@/lib/blog-text";
import { countWords, readingMinutes } from "@/lib/blog-text-stats";
import type { BlogPost } from "@/lib/server/blog";
import { PostAddressField, shownAddress } from "../post-address-field";
import { EMPTY_STATE_JSON, RichTextEditor } from "../rich-text-editor";
import { TaxonomyPicker } from "../taxonomy-picker";
import { CoverImageField } from "./cover-image-field";
import { DateTimePicker } from "./date-time-picker";
import { DotsGlyph, ExternalGlyph } from "./icons";
import { Counter, INPUT_CLASS, PostDate, relativeTime, SidebarSection, StatusPill, useInBrowser } from "./parts";
import { HealthPanel, SearchPanel } from "./search-panel";

interface BlogPostEditorProps {
  readonly post: BlogPost;
  /** Opens the saved version of this post, as a draft, on the business's own website. Null when none is connected. */
  readonly previewHref: string | null;
  /** The website's address, e.g. "https://asterphysio.com"; null when none is connected. */
  readonly siteUrl: string | null;
  readonly categories: readonly TaxonomyOption[];
  readonly authors: readonly TaxonomyOption[];
  readonly save: (postId: string, fields: BlogPostFields, intent: BlogSaveIntent) => Promise<BlogFormResult>;
  readonly createCategory: (name: string) => Promise<TaxonomyResult>;
  readonly createAuthor: (name: string) => Promise<TaxonomyResult>;
  readonly duplicate: (postId: string) => Promise<BlogFormResult>;
  readonly remove: (postId: string) => Promise<BlogFormResult>;
  readonly setCoverImage: (postId: string, mediaId: string) => Promise<BlogFormResult>;
  readonly removeCoverImage: (postId: string) => Promise<BlogFormResult>;
}

const MAX_EXCERPT_LENGTH = 400;

function initialBodyJson(body: unknown): string {
  if (body === null || body === undefined) return EMPTY_STATE_JSON;
  try {
    return JSON.stringify(body) ?? EMPTY_STATE_JSON;
  } catch {
    return EMPTY_STATE_JSON;
  }
}

function parseBody(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hostOf(siteUrl: string | null): string | null {
  if (siteUrl === null) return null;
  try {
    return new URL(siteUrl).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Re-renders every half minute, for "Saved 3 min ago". */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function MoreMenu({
  published,
  busy,
  onUnpublish,
  onDuplicate,
  onDelete,
}: {
  readonly published: boolean;
  readonly busy: boolean;
  readonly onUnpublish: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "block w-full rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors duration-200 ease-calm hover:bg-paper-deep disabled:opacity-50";

  function choose(action: () => void): void {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-full border border-line bg-card text-ink-soft transition-colors duration-200 ease-calm hover:bg-paper-deep hover:text-ink"
      >
        <DotsGlyph />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-48 rounded-control border border-line bg-card p-1.5 shadow-[0_18px_40px_-18px_rgba(42,13,16,0.35)]"
        >
          {published ? (
            <button type="button" role="menuitem" disabled={busy} onClick={() => choose(onUnpublish)} className={item}>
              Unpublish
            </button>
          ) : null}
          <button type="button" role="menuitem" disabled={busy} onClick={() => choose(onDuplicate)} className={item}>
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => choose(onDelete)}
            className={cn(item, "text-accent-deep hover:bg-accent-pale")}
          >
            Delete post
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The post editor: a CMS-style screen with the writing on the left and the publishing settings on the right.
 *
 * Every field but the body lives in `fields`; the body lives in the Lexical editor, which reports its JSON on each
 * edit. Save, Publish, Update and Unpublish all send the whole screen in one write (`updateBlogPostAction`), so what
 * goes live is always what is on screen. Unsaved changes are marked, Ctrl/Cmd+S saves, and leaving the page with
 * unsaved changes asks first.
 */
export function BlogPostEditor({
  post,
  previewHref,
  siteUrl,
  categories,
  authors,
  save,
  createCategory,
  createAuthor,
  duplicate,
  remove,
  setCoverImage,
  removeCoverImage,
}: BlogPostEditorProps): ReactElement {
  const [fields, setFields] = useState<EditorFields>(() => fieldsFromPost(post));
  const [saved, setSaved] = useState<EditorFields>(() => fieldsFromPost(post));
  const [bodyJson, setBodyJson] = useState(() => initialBodyJson(post.body));
  const [bodyDirty, setBodyDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<BlogSaveIntent | "other" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastSent, setLastSent] = useState<EditorFields | null>(null);
  const bodyVersionRef = useRef(0);
  const bodyJsonRef = useRef(bodyJson);
  const now = useNow(30_000);
  const inBrowser = useInBrowser();

  // After a save the page's data refreshes with what the server stored (addresses tidied, text trimmed). Take it in
  // unless the customer has typed since, in which case their edits stay and only the saved baseline moves.
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState(post.updatedAt);
  if (post.updatedAt !== syncedUpdatedAt) {
    setSyncedUpdatedAt(post.updatedAt);
    const fresh = fieldsFromPost(post);
    const untouched =
      sameFields(fields, saved) || (lastSent !== null && sameFields(fields, lastSent));
    if (untouched) setFields(fresh);
    setSaved(fresh);
  }

  const dirty = bodyDirty || !sameFields(fields, saved);
  const update = useCallback((patch: Partial<EditorFields>) => {
    setFields((current) => ({ ...current, ...patch }));
  }, []);

  const handleBodyChange = useCallback((json: string) => {
    bodyJsonRef.current = json;
    bodyVersionRef.current += 1;
    setBodyJson(json);
    setBodyDirty(true);
  }, []);

  // Everything derived from the body is computed from a deferred copy, so typing never waits on it.
  const deferredBody = useDeferredValue(bodyJson);
  const bodyDocument = useMemo(() => parseBody(deferredBody), [deferredBody]);
  const bodyText = useMemo(() => lexicalToPlainText(bodyDocument), [bodyDocument]);
  const headingCount = useMemo(() => lexicalOutline(bodyDocument).length, [bodyDocument]);
  const words = countWords(bodyText);

  const siteHost = hostOf(siteUrl);
  const address = shownAddress(fields.address, fields.title);
  const seo = resolveSeo({
    title: fields.title,
    excerpt: fields.excerpt.trim() === "" ? null : fields.excerpt,
    bodyText,
    metaTitle: fields.metaTitleAuto ? null : fields.metaTitle,
    metaDescription: fields.metaDescriptionAuto ? null : fields.metaDescription,
    noIndex: fields.noIndex,
  });
  const descriptionDefault = resolveSeo({
    title: fields.title,
    excerpt: fields.excerpt.trim() === "" ? null : fields.excerpt,
    bodyText,
    metaTitle: null,
    metaDescription: null,
    noIndex: false,
  }).description;
  const health = seoHealth({
    searchTitle: seo.title,
    searchDescription: seo.description,
    slug: address.split("/").pop() ?? "",
    wordCount: words,
    headingCount,
    hasCoverImage: post.coverImage !== null,
    hasCoverAlt: fields.coverImageAlt.trim() !== "",
    hasCategory: fields.categoryId !== "",
    indexable: !fields.noIndex,
  });

  const typedPublishTime = (() => {
    const iso = fromLocalInputValue(fields.publishedAtLocal);
    const time = iso === "" ? null : new Date(iso).getTime();
    return time === null || Number.isNaN(time) ? null : time;
  })();
  // The state as read with the page, moved on by the clock once a scheduled time passes.
  const savedState = post.publishState === "scheduled" ? blogPublishState(post.status, post.publishedAt, now) : post.publishState;
  const isLive = post.status === "published";
  const willSchedule = typedPublishTime !== null && typedPublishTime > now;

  const run = useCallback(
    (intent: BlogSaveIntent) => {
      setError(null);
      setPendingIntent(intent);
      const sent = fields;
      const sentBodyVersion = bodyVersionRef.current;
      setLastSent(sent);
      startTransition(async () => {
        const result = await save(post.id, toBlogPostFields(sent, bodyJsonRef.current), intent);
        setPendingIntent(null);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (bodyVersionRef.current === sentBodyVersion) setBodyDirty(false);
      });
    },
    [fields, post.id, save],
  );

  const runOther = useCallback((action: () => Promise<BlogFormResult>) => {
    setError(null);
    setPendingIntent("other");
    startTransition(async () => {
      const result = await action();
      setPendingIntent(null);
      if (!result.ok) setError(result.message);
    });
  }, []);

  // Ctrl/Cmd+S saves without changing the post's status.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        runRef.current("save");
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

  const busy = isPending;
  // The server refuses a post with no title, whatever the button: Save, Publish and Update all wait for one.
  const hasTitle = fields.title.trim() !== "";
  const saveLabel = isLive ? "Update" : "Save draft";
  const publishLabel = willSchedule ? "Schedule" : "Publish";

  return (
    <div className="-mt-4">
      {/* The bar that stays in view: where the post stands and what can be done with it. */}
      <div className="sticky top-0 z-30 -mx-5 border-b border-line/70 bg-paper/90 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/content/blog"
                className="shrink-0 text-sm text-ink-soft transition-colors duration-200 ease-calm hover:text-ink"
              >
                ← Blog
              </Link>
              <p className="min-w-0 truncate font-serif text-lg text-ink">{fields.title || "Untitled post"}</p>
              <span aria-hidden="true" className="text-ink-soft/50">·</span>
              <StatusPill state={savedState} />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
              <span>
                Modified <span className="text-ink">{<PostDate time={post.updatedAt} />}</span>
              </span>
              <span>
                {savedState === "scheduled" ? "Goes live " : "Published "}
                <span className="text-ink">
                  {post.publishedAt === null || post.status === "draft" ? "—" : <PostDate time={post.publishedAt} withTime />}
                </span>
              </span>
              <span className="tabular-nums">
                <span className="text-ink">{words}</span> words
              </span>
              <span className="tabular-nums">
                <span className="text-ink">{readingMinutes(words)}</span> min read
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {previewHref === null ? null : (
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                title={dirty ? "Shows your last saved version. Save first to preview your latest changes." : "Opens on your website. Only you can see it."}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink transition-colors duration-200 ease-calm hover:bg-paper-deep"
              >
                Preview
                <ExternalGlyph className="size-3.5 text-ink-soft" />
              </a>
            )}
            {isLive ? null : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy || !hasTitle}
                aria-busy={pendingIntent === "save"}
                onClick={() => run("save")}
                className="h-10"
              >
                {pendingIntent === "save" ? "Saving…" : saveLabel}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={busy || !hasTitle}
              aria-busy={pendingIntent === "publish" || (isLive && pendingIntent === "save")}
              onClick={() => run(isLive ? "save" : "publish")}
              className="h-10"
            >
              {isLive
                ? pendingIntent === "save"
                  ? "Updating…"
                  : saveLabel
                : pendingIntent === "publish"
                  ? "Publishing…"
                  : publishLabel}
            </Button>
            <MoreMenu
              published={isLive}
              busy={busy}
              onUnpublish={() => run("unpublish")}
              onDuplicate={() => {
                if (dirty && !window.confirm("Duplicate the last saved version? Your unsaved changes stay here.")) return;
                runOther(() => duplicate(post.id));
              }}
              onDelete={() => {
                if (window.confirm("Delete this post? This can’t be undone.")) runOther(() => remove(post.id));
              }}
            />
          </div>
        </div>
        {error === null ? null : (
          <p role="alert" className="mt-3 text-sm text-accent-deep">
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-14">
        {/* The writing. */}
        <div className="min-w-0 space-y-8">
          <div>
            <label htmlFor="title" className="sr-only">
              Title
            </label>
            <textarea
              id="title"
              value={fields.title}
              rows={1}
              required
              maxLength={200}
              placeholder="Post title *"
              onChange={(event) => update({ title: event.target.value.replace(/\n/g, " ") })}
              className="field-sizing-content block w-full resize-none bg-transparent font-serif text-[2rem] leading-tight text-ink outline-none placeholder:text-ink-soft/40 sm:text-[2.5rem]"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="excerpt" className="text-[0.8125rem] font-semibold text-ink">
                Summary
              </label>
              <Counter value={fields.excerpt.length} max={MAX_EXCERPT_LENGTH} />
            </div>
            <textarea
              id="excerpt"
              value={fields.excerpt}
              rows={3}
              maxLength={MAX_EXCERPT_LENGTH}
              placeholder="Two or three lines about the post. Shown on your blog page and in search results."
              onChange={(event) => update({ excerpt: event.target.value })}
              className={cn(INPUT_CLASS, "resize-none")}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[0.8125rem] font-semibold text-ink">Cover image</p>
            <CoverImageField
              postId={post.id}
              image={post.coverImage}
              alt={fields.coverImageAlt}
              onAltChange={(coverImageAlt) => update({ coverImageAlt })}
              setCoverImage={setCoverImage}
              removeCoverImage={removeCoverImage}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[0.8125rem] font-semibold text-ink">Post</p>
            <RichTextEditor initialValue={post.body} onChange={handleBodyChange} />
          </div>
        </div>

        {/* The publishing settings. */}
        <aside className="min-w-0 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <SidebarSection
            title="Publishing"
            aside={isLive && siteUrl !== null && savedState === "published" ? "Live" : null}
          >
            <label htmlFor="publishedAt" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
              Publish date
            </label>
            <DateTimePicker
              id="publishedAt"
              value={fields.publishedAtLocal}
              onChange={(publishedAtLocal) => update({ publishedAtLocal })}
              placeholder="When you publish"
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              {willSchedule
                ? "A future date schedules the post: it goes live on its own then."
                : fields.publishedAtLocal === ""
                  ? "Leave empty to use the moment you publish."
                  : "Shown as the post’s date on your website."}
            </p>

            <div className="mt-5">
              <PostAddressField
                value={fields.address}
                onChange={(value) => update({ address: value })}
                title={fields.title}
                host={siteHost}
              />
              {isLive && siteUrl !== null && savedState === "published" ? (
                <a
                  href={`${siteUrl.replace(/\/+$/, "")}/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-deep hover:text-ink"
                >
                  View live post
                  <ExternalGlyph className="size-3" />
                </a>
              ) : null}
            </div>
          </SidebarSection>

          <SidebarSection title="Organise">
            <div className="space-y-4">
              <TaxonomyPicker
                name="categoryId"
                label="Category"
                noneLabel="No category"
                addLabel="New category"
                options={categories}
                initialId={post.categoryId}
                create={createCategory}
                onChange={(categoryId) => update({ categoryId })}
              />
              <TaxonomyPicker
                name="authorId"
                label="Author"
                noneLabel="No author"
                addLabel="New author"
                options={authors}
                initialId={post.authorId}
                create={createAuthor}
                onChange={(authorId) => update({ authorId })}
              />
            </div>
          </SidebarSection>

          <SearchPanel
            breadcrumb={[siteHost ?? "yourwebsite.com", ...address.split("/")].join(" › ")}
            titleDefault={fields.title}
            descriptionDefault={descriptionDefault}
            titleFollows="Search title follows the post title"
            descriptionSource="Taken from your summary, or the start of your post"
            descriptionEmpty="Start writing and the first lines of your post appear here."
            metaTitleAuto={fields.metaTitleAuto}
            metaTitle={fields.metaTitle}
            metaDescriptionAuto={fields.metaDescriptionAuto}
            metaDescription={fields.metaDescription}
            noIndex={fields.noIndex}
            onChange={update}
          />

          <HealthPanel health={health} />
        </aside>
      </div>

      {/* Save state, out of the way in the corner. */}
      <p
        role="status"
        className="pointer-events-none fixed bottom-5 right-6 z-30 flex items-center gap-2 rounded-full bg-card/95 px-3.5 py-1.5 text-xs text-ink-soft shadow-[0_10px_30px_-14px_rgba(42,13,16,0.35)] ring-1 ring-line/70 backdrop-blur"
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", dirty ? "bg-accent-deep" : "bg-ink-soft/40")}
        />
        {busy ? "Saving…" : dirty ? "Unsaved changes" : inBrowser ? `Saved ${relativeTime(post.updatedAt, now)}` : "Saved"}
      </p>
    </div>
  );
}
