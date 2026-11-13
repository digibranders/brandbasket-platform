"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PageHeader, Panel } from "@/components";
import type { ActionResult } from "@/lib/action-result";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/ui/button-styles";
import { AlertDialog, Banner, Button, Field, IconButton, Input, Menu, MenuItem, Textarea } from "@/ui";
import { shownAddress, siteHost } from "../rules/address";
import { bodyJsonOf, countWords, lexicalOutline, lexicalToPlainText } from "../rules/body";
import { BLOG_MEDIA_PATH, BLOG_PATH, postPreviewPath } from "../rules/paths";
import {
  blogPublishState,
  COVER_ALT_MAX_LENGTH,
  fieldsFromPost,
  fromLocalInputValue,
  POST_EXCERPT_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
  sameFields,
  toBlogPostFields,
  type BlogPost,
  type BlogPostFields,
  type BlogSaveIntent,
  type EditorFields,
} from "../rules/posts";
import { resolveSeo, seoHealth } from "../rules/seo";
import { PublishStateBadge } from "./blog-frame";
import { BodyEditor } from "./body-editor";
import { Counter, HealthChecklist, ImageField, SearchFields, SidePanel, TaxonomyPicker } from "./editor-parts";

type TaxonomyOption = { readonly id: string; readonly name: string };

export interface PostEditorProps {
  readonly post: BlogPost;
  /** The business's own website, for the address preview and Preview; null when none is on file yet. */
  readonly websiteUrl: string | null;
  readonly categories: readonly TaxonomyOption[];
  readonly authors: readonly TaxonomyOption[];
  readonly canWrite: boolean;
  readonly save: (postId: string, fields: BlogPostFields, intent: BlogSaveIntent) => Promise<ActionResult>;
  readonly duplicate: (postId: string) => Promise<ActionResult>;
  readonly remove: (postId: string) => Promise<ActionResult>;
  readonly removeCover: (postId: string) => Promise<ActionResult>;
  readonly createCategory: (name: string) => Promise<ActionResult<TaxonomyOption>>;
  readonly createAuthor: (name: string) => Promise<ActionResult<TaxonomyOption>>;
}

function parseBody(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Moves on every half minute, so a scheduled post shows Published once its time has come. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The post editor: the writing on the left, the publishing settings on the right. Ported from apps/platform
 * components/panel/blog-editor/blog-post-editor.tsx with a new layout; the rules are the same. Save, Publish, Update and
 * Unpublish send the whole screen in one write, so what goes live is what is on screen. Ctrl or Cmd with S saves without
 * changing the status, and leaving with unsaved changes asks first.
 */
export function PostEditor({ post, websiteUrl, categories, authors, canWrite, save, duplicate, remove, removeCover, createCategory, createAuthor }: PostEditorProps) {
  const [fields, setFields] = useState<EditorFields>(() => fieldsFromPost(post));
  const [saved, setSaved] = useState<EditorFields>(() => fieldsFromPost(post));
  const [lastSent, setLastSent] = useState<EditorFields | null>(null);
  const [bodyJson, setBodyJson] = useState(() => bodyJsonOf(post.body));
  const [bodyDirty, setBodyDirty] = useState(false);
  const [error, setError] = useState<{ readonly message: string; readonly fieldErrors?: Readonly<Record<string, string>> } | null>(null);
  const [pendingIntent, setPendingIntent] = useState<BlogSaveIntent | "other" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const bodyVersion = useRef(0);
  const bodyRef = useRef(bodyJson);
  // The server's last write is never in the future: without this floor, a post published a moment ago reads "Scheduled"
  // until the next tick of the clock.
  const now = Math.max(useNow(), post.updatedAt);

  // After a save (or a new cover) the page refreshes with what the server stored. Take it in unless the customer has typed
  // since: then their edits stay and only the saved baseline moves.
  const [syncedAt, setSyncedAt] = useState(post.updatedAt);
  if (post.updatedAt !== syncedAt) {
    setSyncedAt(post.updatedAt);
    const fresh = fieldsFromPost(post);
    if (sameFields(fields, saved) || (lastSent !== null && sameFields(fields, lastSent))) setFields(fresh);
    setSaved(fresh);
  }

  const dirty = bodyDirty || !sameFields(fields, saved);
  const update = useCallback((patch: Partial<EditorFields>) => setFields((current) => ({ ...current, ...patch })), []);
  const handleBody = useCallback((json: string) => {
    bodyRef.current = json;
    bodyVersion.current += 1;
    setBodyJson(json);
    setBodyDirty(true);
  }, []);

  // Everything derived from the body is computed from a deferred copy, so typing never waits on it.
  const deferredBody = useDeferredValue(bodyJson);
  const bodyDoc = useMemo(() => parseBody(deferredBody), [deferredBody]);
  const bodyText = useMemo(() => lexicalToPlainText(bodyDoc), [bodyDoc]);
  const headingCount = useMemo(() => lexicalOutline(bodyDoc).length, [bodyDoc]);

  const host = siteHost(websiteUrl);
  const address = shownAddress(fields.address, fields.title);
  const excerpt = fields.excerpt.trim() === "" ? null : fields.excerpt;
  const seo = resolveSeo({ title: fields.title, excerpt, bodyText, metaTitle: fields.metaTitleAuto ? null : fields.metaTitle, metaDescription: fields.metaDescriptionAuto ? null : fields.metaDescription, noIndex: fields.noIndex });
  const descriptionDefault = resolveSeo({ title: fields.title, excerpt, bodyText, metaTitle: null, metaDescription: null, noIndex: false }).description;
  const health = seoHealth({
    searchTitle: seo.title,
    searchDescription: seo.description,
    slug: address.split("/").pop() ?? "",
    wordCount: countWords(bodyText),
    headingCount,
    hasCoverImage: post.coverImage !== null,
    hasCoverAlt: fields.coverImageAlt.trim() !== "",
    hasCategory: fields.categoryId !== "",
    indexable: !fields.noIndex,
  });

  const typedTime = (() => {
    const iso = fromLocalInputValue(fields.publishedAtLocal);
    const time = iso === "" ? Number.NaN : new Date(iso).getTime();
    return Number.isNaN(time) ? null : time;
  })();
  const state = blogPublishState(post.status, post.publishedAt, now);
  const isLive = post.status === "published";
  const willSchedule = typedTime !== null && typedTime > now;
  const hasTitle = fields.title.trim() !== "";

  const run = useCallback(
    (intent: BlogSaveIntent) => {
      if (!canWrite) return;
      setError(null);
      setPendingIntent(intent);
      const sent = fields;
      const sentVersion = bodyVersion.current;
      setLastSent(sent);
      startTransition(async () => {
        const result = await save(post.id, toBlogPostFields(sent, bodyRef.current), intent);
        setPendingIntent(null);
        if (!result.ok) {
          setError(result.fieldErrors === undefined ? { message: result.message } : { message: result.message, fieldErrors: result.fieldErrors });
          return;
        }
        if (bodyVersion.current === sentVersion) setBodyDirty(false);
      });
    },
    [canWrite, fields, post.id, save],
  );

  const runOther = (action: () => Promise<ActionResult>) => {
    setError(null);
    setPendingIntent("other");
    startTransition(async () => {
      const result = await action();
      setPendingIntent(null);
      if (!result.ok) setError({ message: result.message });
    });
  };

  // Ctrl or Cmd with S saves without changing the post's status, as in the old editor.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        runRef.current("save");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const fieldError = (name: string): string | undefined => error?.fieldErrors?.[name];
  const savedLine = pending ? "Saving" : dirty ? "Unsaved changes" : `Saved ${formatDateTime(new Date(post.updatedAt), new Date(now))}`;

  const actions = (
    <>
      {websiteUrl === null ? null : (
        <a
          href={postPreviewPath(post.id)}
          target="_blank"
          rel="noopener noreferrer"
          title={dirty ? "Shows your last saved version. Save first to preview your latest changes." : "Opens on your website. Only you can see it."}
          className={buttonClasses("secondary", "md")}
        >
          Preview
        </a>
      )}
      {canWrite && !isLive ? (
        <Button disabled={pending || !hasTitle} pending={pendingIntent === "save"} onClick={() => run("save")}>
          Save draft
        </Button>
      ) : null}
      {canWrite ? (
        <Button variant="primary" disabled={pending || !hasTitle} pending={pendingIntent === "publish" || (isLive && pendingIntent === "save")} onClick={() => run(isLive ? "save" : "publish")}>
          {isLive ? "Update" : willSchedule ? "Schedule" : "Publish"}
        </Button>
      ) : null}
      {canWrite ? (
        <Menu trigger={<IconButton icon="DotsThree" label="More actions" disabled={pending} />} align="end">
          {isLive ? <MenuItem onClick={() => run("unpublish")}>Unpublish</MenuItem> : null}
          <MenuItem onClick={() => runOther(() => duplicate(post.id))}>{dirty ? "Duplicate last saved version" : "Duplicate"}</MenuItem>
          <MenuItem tone="danger" onClick={() => setConfirmDelete(true)}>
            Delete post
          </MenuItem>
        </Menu>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        back={{ href: BLOG_PATH, label: "Blog" }}
        title={fields.title.trim() === "" ? "Untitled post" : fields.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PublishStateBadge state={state} />
            {state === "draft" || post.publishedAt === null ? null : <span>{`${state === "scheduled" ? "Goes live" : "Published"} ${formatDateTime(new Date(post.publishedAt), new Date(now))}`}</span>}
            <span role="status">{savedLine}</span>
          </span>
        }
        actions={actions}
      />
      {error === null ? null : (
        <Banner tone="neg" className="mb-4">
          {error.message}
        </Banner>
      )}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this post?"
        description="It comes off your website and frees one post of your allowance. This cannot be undone."
        cancelLabel="Keep post"
        action={
          <Button
            variant="danger"
            pending={pendingIntent === "other"}
            onClick={() => {
              setConfirmDelete(false);
              runOther(() => remove(post.id));
            }}
          >
            Delete post
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Panel title="Post">
            <div className="flex flex-col gap-4">
              <Field label="Title" error={fieldError("title")} disabled={!canWrite}>
                <Input value={fields.title} required maxLength={POST_TITLE_MAX_LENGTH} onChange={(event) => update({ title: event.currentTarget.value.replace(/\n/g, " ") })} />
              </Field>
              <Field label="Summary" hint={<>Shown on your blog page and in search results. <Counter value={fields.excerpt.length} max={POST_EXCERPT_MAX_LENGTH} /></>} disabled={!canWrite}>
                <Textarea rows={3} value={fields.excerpt} maxLength={POST_EXCERPT_MAX_LENGTH} onChange={(event) => update({ excerpt: event.currentTarget.value })} />
              </Field>
              <ImageField
                label="Cover image"
                image={post.coverImage}
                uploadUrl={`${BLOG_MEDIA_PATH}?post=${encodeURIComponent(post.id)}`}
                remove={() => removeCover(post.id)}
                readOnly={!canWrite}
                onChanged={(kind) => {
                  if (kind === "removed") update({ coverImageAlt: "" });
                }}
              />
              {post.coverImage === null ? null : (
                <Field label="Cover image description" hint="Describes the image for people using screen readers and for search engines." error={fieldError("coverImageAlt")} disabled={!canWrite}>
                  <Input value={fields.coverImageAlt} maxLength={COVER_ALT_MAX_LENGTH} onChange={(event) => update({ coverImageAlt: event.currentTarget.value })} />
                </Field>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="type-sub text-ink">Text</span>
                <BodyEditor initialJson={bodyJsonOf(post.body)} onChange={handleBody} readOnly={!canWrite} />
                {fieldError("body") === undefined ? null : <p className="type-meta text-neg-text">{fieldError("body")}</p>}
              </div>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SidePanel title="Publishing">
            <Field
              label="Publish date"
              hint={willSchedule ? "A date ahead schedules the post: it goes live on its own then." : fields.publishedAtLocal === "" ? "Leave empty to use the moment you publish." : "Shown as the post's date on your website."}
              error={fieldError("publishedAt")}
              disabled={!canWrite}
            >
              <Input type="datetime-local" value={fields.publishedAtLocal} onChange={(event) => update({ publishedAtLocal: event.currentTarget.value })} />
            </Field>
            <Field label="Web address" hint={`${host ?? "yourwebsite.com"}/${address}`} error={fieldError("address")} disabled={!canWrite}>
              <Input value={fields.address} placeholder={shownAddress("", fields.title)} maxLength={150} spellCheck={false} autoCapitalize="none" onChange={(event) => update({ address: event.currentTarget.value })} />
            </Field>
            {state === "published" && websiteUrl !== null ? (
              <a href={`${websiteUrl.replace(/\/+$/, "")}/${address}`} target="_blank" rel="noopener noreferrer" className="w-fit type-meta text-accent-text">
                View live post
              </a>
            ) : null}
          </SidePanel>

          <SidePanel title="Organise">
            <TaxonomyPicker label="Category" noneLabel="No category" addLabel="New category" options={categories} value={fields.categoryId} onChange={(categoryId) => update({ categoryId })} create={createCategory} readOnly={!canWrite} />
            <TaxonomyPicker label="Author" noneLabel="No author" addLabel="New author" options={authors} value={fields.authorId} onChange={(authorId) => update({ authorId })} create={createAuthor} readOnly={!canWrite} />
          </SidePanel>

          <SearchFields
            breadcrumb={[host ?? "yourwebsite.com", ...address.split("/")].join(" › ")}
            titleDefault={fields.title}
            descriptionDefault={descriptionDefault}
            titleAutoLabel="Search title follows the post title"
            descriptionAutoLabel="Search description follows your summary or the start of the post"
            descriptionEmpty="Start writing and the first lines of your post appear here."
            metaTitleAuto={fields.metaTitleAuto}
            metaTitle={fields.metaTitle}
            metaDescriptionAuto={fields.metaDescriptionAuto}
            metaDescription={fields.metaDescription}
            noIndex={fields.noIndex}
            readOnly={!canWrite}
            errors={error?.fieldErrors}
            onChange={update}
          />

          <HealthChecklist health={health} />
        </div>
      </div>
    </>
  );
}
