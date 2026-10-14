/**
 * An author's profile links: their own website and four social profiles. Client sites print them as links, so only
 * a plain http(s) address is ever stored. People paste these in every shape — "instagram.com/asha", "www.x.com/asha",
 * "https://…" — so a missing scheme is added rather than refused.
 */
export const AUTHOR_LINK_KINDS = ["website", "instagram", "facebook", "linkedin", "x"] as const;

export type AuthorLinkKind = (typeof AUTHOR_LINK_KINDS)[number];

export type AuthorLinks = Readonly<Record<AuthorLinkKind, string | null>>;

export const AUTHOR_LINK_LABELS: Readonly<Record<AuthorLinkKind, string>> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
};

export const AUTHOR_LINK_PLACEHOLDERS: Readonly<Record<AuthorLinkKind, string>> = {
  website: "yourwebsite.com",
  instagram: "instagram.com/yourname",
  facebook: "facebook.com/yourname",
  linkedin: "linkedin.com/in/yourname",
  x: "x.com/yourname",
};

const MAX_LINK_LENGTH = 300;

export type AuthorLinkResult = { readonly ok: true; readonly value: string | null } | { readonly ok: false };

/** "" is no link; anything else must read as a web address with a dot in its host. */
export function parseAuthorLink(raw: string): AuthorLinkResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_LINK_LENGTH || /\s/.test(trimmed)) return { ok: false };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".")) return { ok: false };
  return { ok: true, value: url.href };
}

export function emptyAuthorLinks(): AuthorLinks {
  return { website: null, instagram: null, facebook: null, linkedin: null, x: null };
}
