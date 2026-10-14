import { cleanLine } from "@firstfold/shared/lib/validation/text";
import { AUTHOR_LINK_KINDS, AUTHOR_LINK_LABELS, parseAuthorLink, type AuthorLinkKind, type AuthorLinks } from "./author-links";

/**
 * What the author editor saves, and the rules it is cleaned by before anything is written. Pure, so it is tested
 * without Payload.
 */
export const AUTHOR_NAME_MAX_LENGTH = 60;
export const AUTHOR_ROLE_MAX_LENGTH = 80;
export const AUTHOR_BIO_MAX_LENGTH = 160;

export interface BlogAuthorFields {
  readonly name: string;
  readonly role: string;
  readonly bio: string;
  readonly links: Readonly<Record<AuthorLinkKind, string>>;
}

export interface CleanBlogAuthor {
  readonly name: string;
  readonly role: string | null;
  readonly bio: string | null;
  readonly links: AuthorLinks;
}

export type CleanBlogAuthorResult =
  | { readonly ok: true; readonly value: CleanBlogAuthor }
  | { readonly ok: false; readonly message: string };

function oneLine(raw: string, max: number): string {
  return cleanLine(raw).replace(/\s+/g, " ").slice(0, max).trim();
}

export function cleanBlogAuthorFields(fields: BlogAuthorFields): CleanBlogAuthorResult {
  const name = oneLine(fields.name, AUTHOR_NAME_MAX_LENGTH);
  if (name === "") return { ok: false, message: "Give the author a name." };
  const role = oneLine(fields.role, AUTHOR_ROLE_MAX_LENGTH);
  const bio = oneLine(fields.bio, AUTHOR_BIO_MAX_LENGTH);

  const links: Partial<Record<AuthorLinkKind, string | null>> = {};
  for (const kind of AUTHOR_LINK_KINDS) {
    const parsed = parseAuthorLink(fields.links[kind] ?? "");
    if (!parsed.ok) {
      return { ok: false, message: `The ${AUTHOR_LINK_LABELS[kind]} link isn't a web address. Paste the full link.` };
    }
    links[kind] = parsed.value;
  }

  return {
    ok: true,
    value: { name, role: role === "" ? null : role, bio: bio === "" ? null : bio, links: links as AuthorLinks },
  };
}
