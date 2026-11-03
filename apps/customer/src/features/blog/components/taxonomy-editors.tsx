"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { PageHeader, Panel, SaveBar } from "@/components";
import type { ActionResult } from "@/lib/action-result";
import { formatDate, formatNumber } from "@/lib/format";
import { AlertDialog, Banner, Button, Field, Icon, Input, Switch, Textarea } from "@/ui";
import { slugify } from "../rules/address";
import { BLOG_AUTHORS_PATH, BLOG_CATEGORIES_PATH, BLOG_MEDIA_PATH } from "../rules/paths";
import {
  AUTHOR_BIO_MAX_LENGTH,
  AUTHOR_LINK_KINDS,
  AUTHOR_LINK_LABELS,
  AUTHOR_NAME_MAX_LENGTH,
  AUTHOR_ROLE_MAX_LENGTH,
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  slugFollowsName,
  type BlogAuthorFields,
  type BlogCategoryFields,
} from "../rules/taxonomy";
import type { BlogAuthor, BlogCategory } from "../server/store";
import { ImageField, SearchFields } from "./editor-parts";

/** One group of a form: what it is and where it appears on the left, the fields on the right (plan 60, section 14). */
function Section({ title, where, children }: { readonly title: string; readonly where: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-border-subtle p-4 last:border-b-0 md:grid-cols-3 md:gap-6">
      <div>
        <h3 className="type-sub">{title}</h3>
        <p className="mt-1 flex items-center gap-1.5 type-meta">
          <Icon name="Globe" size="sm" />
          {where}
        </p>
      </div>
      <div className="flex flex-col gap-4 md:col-span-2">{children}</div>
    </div>
  );
}

/** Save with the SaveBar, answer in a Banner and under the field, and keep the form's own copy until the save lands. */
function useSaveForm<T>(initial: T, save: (fields: T) => Promise<ActionResult>) {
  const [fields, setFields] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline);
  // Leaving with unsaved changes asks first, as the old author and category editors did.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const sent = fields;
    startTransition(async () => {
      const answer = await save(sent);
      setResult(answer);
      if (answer.ok) setBaseline(sent);
    });
  };
  const failure = result !== null && !result.ok ? result : null;
  return {
    fields,
    set: (patch: Partial<T>) => setFields((current) => ({ ...current, ...patch })),
    discard: () => setFields(baseline),
    dirty,
    pending,
    submit,
    failure,
    errorOf: (name: string) => failure?.fieldErrors?.[name],
  };
}

function DeleteButton({ what, consequence, remove }: { readonly what: string; readonly consequence: string; readonly remove: () => Promise<ActionResult> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        trigger={<Button variant="danger">{`Delete ${what}`}</Button>}
        title={`Delete this ${what}?`}
        description={consequence}
        cancelLabel={`Keep ${what}`}
        action={
          <Button
            variant="danger"
            pending={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await remove();
                setOpen(false);
                if (!result.ok) setError(result.message);
              })
            }
          >
            {`Delete ${what}`}
          </Button>
        }
      />
      {error === null ? null : <Banner tone="neg">{error}</Banner>}
    </>
  );
}

const FORM_ID = "blog-taxonomy-form";

export interface AuthorEditorProps {
  readonly author: BlogAuthor;
  readonly canWrite: boolean;
  readonly save: (authorId: string, fields: BlogAuthorFields) => Promise<ActionResult>;
  readonly removePhoto: (authorId: string) => Promise<ActionResult>;
  readonly remove: (authorId: string) => Promise<ActionResult>;
}

/** One author: who they are, their photo and links, and how much they have written. Their posts stay if they are deleted. */
export function AuthorEditor({ author, canWrite, save, removePhoto, remove }: AuthorEditorProps) {
  const initial: BlogAuthorFields = {
    name: author.name,
    role: author.role ?? "",
    bio: author.bio ?? "",
    links: Object.fromEntries(AUTHOR_LINK_KINDS.map((kind) => [kind, author.links[kind] ?? ""])) as BlogAuthorFields["links"],
  };
  const form = useSaveForm(initial, (fields) => save(author.id, fields));
  const { fields } = form;
  return (
    <>
      <PageHeader
        back={{ href: BLOG_AUTHORS_PATH, label: "Authors" }}
        title={author.name}
        description={`${formatNumber(author.publishedCount)} published, ${formatNumber(author.draftCount)} drafts${author.lastPublishedAt === null ? "" : `. Last published ${formatDate(new Date(author.lastPublishedAt))}`}`}
        actions={canWrite ? <DeleteButton what="author" consequence="Their posts stay on your website, without an author. This cannot be undone." remove={() => remove(author.id)} /> : undefined}
      />
      {form.failure === null ? null : (
        <Banner tone="neg" className="mb-4">
          {form.failure.message}
        </Banner>
      )}
      <form id={FORM_ID} onSubmit={form.submit}>
        <Panel title="Author" flush>
          <Section title="About" where="Shown with the posts they write">
            <Field label="Name" error={form.errorOf("name")} disabled={!canWrite}>
              <Input value={fields.name} required maxLength={AUTHOR_NAME_MAX_LENGTH} onChange={(event) => form.set({ name: event.currentTarget.value })} />
            </Field>
            <Field label="Role" hint="For example, Head physio." disabled={!canWrite}>
              <Input value={fields.role} maxLength={AUTHOR_ROLE_MAX_LENGTH} onChange={(event) => form.set({ role: event.currentTarget.value })} />
            </Field>
            <Field label="Bio" hint={`One or two lines, shown under their posts. Up to ${AUTHOR_BIO_MAX_LENGTH} characters.`} disabled={!canWrite}>
              <Textarea rows={3} value={fields.bio} maxLength={AUTHOR_BIO_MAX_LENGTH} onChange={(event) => form.set({ bio: event.currentTarget.value })} />
            </Field>
            <ImageField label="Photo" image={author.photo} uploadUrl={`${BLOG_MEDIA_PATH}?author=${encodeURIComponent(author.id)}`} remove={() => removePhoto(author.id)} readOnly={!canWrite} />
          </Section>
          <Section title="Links" where="Shown under their posts">
            {AUTHOR_LINK_KINDS.map((kind) => (
              <Field key={kind} label={AUTHOR_LINK_LABELS[kind]} error={form.errorOf(kind)} disabled={!canWrite}>
                <Input
                  value={fields.links[kind]}
                  maxLength={300}
                  spellCheck={false}
                  autoCapitalize="none"
                  inputMode="url"
                  onChange={(event) => form.set({ links: { ...fields.links, [kind]: event.currentTarget.value } })}
                />
              </Field>
            ))}
          </Section>
        </Panel>
      </form>
      <SaveBar dirty={canWrite && form.dirty} formId={FORM_ID} onDiscard={form.discard} pending={form.pending} />
    </>
  );
}

export interface CategoryEditorProps {
  readonly category: BlogCategory;
  /** The business's website host, for showing the category's address; null when none is on file. */
  readonly host: string | null;
  readonly canWrite: boolean;
  readonly save: (categoryId: string, fields: BlogCategoryFields) => Promise<ActionResult>;
  readonly remove: (categoryId: string) => Promise<ActionResult>;
}

/** One category: its name and description, its address on the website, and how Google shows its page. */
export function CategoryEditor({ category, host, canWrite, save, remove }: CategoryEditorProps) {
  const initial: BlogCategoryFields = {
    name: category.name,
    description: category.description ?? "",
    slugAuto: slugFollowsName(category.slug, category.name),
    slug: category.slug,
    metaTitle: category.metaTitle ?? "",
    metaDescription: category.metaDescription ?? "",
  };
  const form = useSaveForm(initial, (fields) => save(category.id, fields));
  const { fields } = form;
  const slug = fields.slugAuto ? slugify(fields.name) : slugify(fields.slug);
  const address = `/blog/category/${slug}`;
  return (
    <>
      <PageHeader
        back={{ href: BLOG_CATEGORIES_PATH, label: "Categories" }}
        title={category.name}
        description={`${formatNumber(category.publishedCount)} published, ${formatNumber(category.draftCount)} drafts`}
        actions={canWrite ? <DeleteButton what="category" consequence="Its posts stay on your website, without a category, and the category's page stops working. This cannot be undone." remove={() => remove(category.id)} /> : undefined}
      />
      {form.failure === null ? null : (
        <Banner tone="neg" className="mb-4">
          {form.failure.message}
        </Banner>
      )}
      <form id={FORM_ID} onSubmit={form.submit} className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Category" flush>
            <Section title="About" where="Shown at the top of the category's page">
              <Field label="Name" error={form.errorOf("name")} disabled={!canWrite}>
                <Input value={fields.name} required maxLength={CATEGORY_NAME_MAX_LENGTH} onChange={(event) => form.set({ name: event.currentTarget.value })} />
              </Field>
              <Field label="Description" hint="A line or two about what these posts cover." disabled={!canWrite}>
                <Textarea rows={3} value={fields.description} maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH} onChange={(event) => form.set({ description: event.currentTarget.value })} />
              </Field>
            </Section>
            <Section title="Web address" where={`${host ?? "yourwebsite.com"}${address}`}>
              <Switch label="The address follows the name" checked={fields.slugAuto} disabled={!canWrite} onCheckedChange={(slugAuto) => form.set(slugAuto ? { slugAuto } : { slugAuto, slug: fields.slug || slug })} />
              <Field label="Address" hint="Changing it moves the category's page. The old address stops working." error={form.errorOf("slug")} disabled={!canWrite || fields.slugAuto}>
                <Input value={fields.slugAuto ? slug : fields.slug} readOnly={fields.slugAuto} maxLength={100} spellCheck={false} autoCapitalize="none" onChange={(event) => form.set({ slug: event.currentTarget.value })} />
              </Field>
            </Section>
          </Panel>
        </div>
        <SearchFields
          breadcrumb={[host ?? "yourwebsite.com", "blog", "category", slug].join(" › ")}
          titleDefault={fields.name}
          descriptionDefault={fields.description.trim() === "" ? null : fields.description}
          titleAutoLabel="Search title follows the category name"
          descriptionAutoLabel="Search description follows the description"
          descriptionEmpty="Add a description and it appears here."
          metaTitleAuto={fields.metaTitle === ""}
          metaTitle={fields.metaTitle}
          metaDescriptionAuto={fields.metaDescription === ""}
          metaDescription={fields.metaDescription}
          readOnly={!canWrite}
          errors={form.failure?.fieldErrors}
          onChange={(patch) =>
            form.set({
              ...(patch.metaTitleAuto === true ? { metaTitle: "" } : {}),
              ...(patch.metaTitle === undefined ? {} : { metaTitle: patch.metaTitle }),
              ...(patch.metaDescriptionAuto === true ? { metaDescription: "" } : {}),
              ...(patch.metaDescription === undefined ? {} : { metaDescription: patch.metaDescription }),
            })
          }
        />
      </form>
      <SaveBar dirty={canWrite && form.dirty} formId={FORM_ID} onDiscard={form.discard} pending={form.pending} />
    </>
  );
}
