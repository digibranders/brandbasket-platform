import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { AuthorEditor } from "@/components/panel/blog-editor/author-editor";
import { getBlogAuthor } from "@/lib/server/blog-taxonomy";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { deleteAuthorAction, removeAuthorPhotoAction, saveAuthorAction, setAuthorPhotoAction } from "../actions";

export const metadata: Metadata = { title: "Author" };

/** A missing author and another business's author both give the same 404. */
export default async function AuthorPage({
  params,
}: {
  readonly params: Promise<{ readonly authorId: string }>;
}): Promise<ReactElement> {
  await requireWebsiteClient();
  const { authorId } = await params;
  const author = await getBlogAuthor(authorId);
  if (author === null) notFound();

  return (
    <>
      <h1 className="sr-only">{author.name}</h1>
      <AuthorEditor
        key={author.id}
        author={author}
        save={saveAuthorAction}
        setPhoto={setAuthorPhotoAction}
        removePhoto={removeAuthorPhotoAction}
        remove={deleteAuthorAction}
      />
    </>
  );
}
