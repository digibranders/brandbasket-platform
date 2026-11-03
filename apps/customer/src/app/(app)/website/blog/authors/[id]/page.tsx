import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Panel, PanelError } from "@/components";
import { AuthorEditor } from "@/features/blog/components/taxonomy-editors";
import { loadAuthor } from "@/features/blog/loader";
import { isDocId } from "@/features/blog/rules/paths";
import { canWriteBlog } from "@/features/blog/server/access";
import { deleteAuthorAction, removeAuthorPhotoAction, saveAuthorAction } from "@/features/blog/taxonomy-actions";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Author" };

/** A missing author and another business's author are the same 404; a failed read shows its error. */
export default async function AuthorPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const customer = await requireWebsite();
  const { id } = await params;
  if (!isDocId(id)) notFound();
  const author = await loadAuthor(customer, id, new Date());
  if (!author.ok) {
    return (
      <Panel title="Author">
        <PanelError failure={author.error} what="this author" />
      </Panel>
    );
  }
  if (author.data === null) notFound();
  return <AuthorEditor key={author.data.id} author={author.data} canWrite={canWriteBlog(customer)} save={saveAuthorAction} removePhoto={removeAuthorPhotoAction} remove={deleteAuthorAction} />;
}
