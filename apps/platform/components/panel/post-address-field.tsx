"use client";

import type { ReactElement } from "react";

interface PostAddressFieldProps {
  /** The box as typed, e.g. "blog/five-stretches-for-desk-bound-backs". */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The current title: a blank box uses an address made from it. */
  readonly title: string;
  /** The business's website host, e.g. "asterphysio.com", or null when none is connected yet. */
  readonly host: string | null;
}

/** Mirrors lib/blog-slug.ts's slugify, so the address shown is the one Save produces. */
function tidy(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The address as it will be saved, from what is typed (lib/post-path.ts's parseArticleAddress checks it on Save). */
export function shownAddress(value: string, title: string): string {
  const typed = value.trim().replace(/^\/+/, "");
  const trimmed = typed.replace(/\/+$/, "");
  if (trimmed === "") return `blog/${tidy(title)}`;
  const parts = typed.endsWith("/") && !trimmed.includes("/") ? [trimmed, ""] : trimmed.split("/");
  const slug = tidy(parts[parts.length - 1] ?? "") || tidy(title);
  return parts.length >= 2 ? `${tidy(parts[0] ?? "")}/${slug}` : slug;
}

/**
 * Where this article lives on the website, in one box: "geo/article-1" gives yourwebsite.com/geo/article-1,
 * "article-1" gives yourwebsite.com/article-1, and an empty box shows (as its placeholder) the default it will use.
 * Controlled by the post editor, and saved with the post. Changing it later is safe: the website redirects the
 * article's old addresses to the new one.
 */
export function PostAddressField({ value, onChange, title, host }: PostAddressFieldProps): ReactElement {
  const site = host ?? "yourwebsite.com";
  return (
    <div>
      <label htmlFor="address" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
        Web address
      </label>
      <div className="flex items-center rounded-control border border-line bg-card pl-3 text-sm transition-colors duration-200 ease-calm focus-within:border-accent hover:border-ink-soft/40">
        <span className="shrink-0 text-ink-soft">/</span>
        <input
          id="address"
          value={value}
          placeholder={`blog/${tidy(title)}`}
          maxLength={150}
          spellCheck={false}
          autoCapitalize="none"
          onChange={(event) => onChange(event.target.value)}
          aria-describedby="address-result"
          className="block min-w-0 flex-1 bg-transparent py-2 pl-0.5 pr-3 text-ink outline-none placeholder:text-ink-soft/60"
        />
      </div>
      <p id="address-result" className="mt-1.5 break-all text-xs text-ink-soft">
        {site}/<span className="text-ink">{shownAddress(value, title)}</span>
      </p>
    </div>
  );
}
