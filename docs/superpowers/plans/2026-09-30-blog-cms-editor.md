# Blog CMS editor (customer dashboard)

Goal: turn the customer dashboard's blog into a real CMS screen, modelled on the CleanStart CMS the user shared
(2026-09-30): a posts table and a two-column post editor with a publishing sidebar. Firstfold's own cream/burgundy
panel look is kept; the structure follows the reference.

Branch `feat/blog-cms-editor` (worktree `first-found/blog-cms`), local only until the user asks to push. Local
server: launch entry `blogcms-platform`, http://app.localhost:3091, on private DB copies `webfold_blogcms` and
`webfold_payload_blogcms`.

## What we give customers (and what we leave out)

Kept from the reference, because a local business's blog benefits from it:

| Area | Options |
| --- | --- |
| Posts table | Title, author, category, status pill (Draft / Published / Scheduled), published and updated dates; search; status tabs with counts; select rows to publish, unpublish or delete together |
| Editor header | Status pill, title, modified / published dates, word count, reading time; Preview on my website; Save draft or Update; Publish (menu: Unpublish); more menu: Duplicate, Delete; unsaved-changes marker, Ctrl/Cmd+S, leave-page warning |
| Main column | Title, summary with counter, cover image (replace, remove, alt text, size), body editor, author, category, related posts (up to 3), live table of contents |
| Body editor | Undo/redo, paragraph / H2 / H3 / H4 / quote, bold, italic, underline, strikethrough, inline code, subscript, superscript, bullet and numbered lists with indent/outdent, link, divider, align left/centre/right, fullscreen |
| Sidebar | Web address, permalink (copy, open), publish date (a future date schedules the post), SEO health score with checklist, search title and description with Auto switches and counters, indexing (Index / No-index / No-index + No-follow), Google preview, social card preview, canonical URL, address history, table-of-contents depth, Featured, Pinned |

Left out on purpose: reviewer and review date, primary/supporting topics, hreflang, hand-edited JSON-LD (client
sites generate it), manual previous/next post (sites order by date), page purge, several authors per post (one
author and one category stay the 2026-09-24 decision), images and tables inside the body (public media serving is
still on hold: `/content-media` needs a signed-in session, so an inline image would be broken on the live site).

## Data (Payload `blogPosts`, one generated migration)

New columns: `cover_image_alt` text, `no_follow` bool, `canonical_url` text, `featured` bool, `pinned` bool,
`toc_depth` text, and `related_posts` (hasMany relationship to blogPosts, max 3, own business only).

## Site API (additive only)

`SitePost` gains `coverImageAlt`, `featured`, `pinned`, `canonicalUrl`, `seo.noFollow`, `related` (slug, pathPrefix,
title of published related posts), `toc` (depth + headings). Headings in `html` gain `id`s so a table of contents can
link to them. `html` also renders the new body nodes. `/api/site/posts` leaves out posts whose publish date is still
in the future (scheduled).

## Pure logic (tested)

- `lib/blog-html.ts`: new nodes and formats, heading ids, outline.
- `lib/blog-text-stats.ts`: words, reading time.
- `lib/blog-seo-health.ts`: score + checklist.
- `lib/blog-publish-state.ts`: draft / scheduled / published from status + date.
- `lib/canonical-url.ts`: http(s) only.

## Checks

`pnpm --filter @firstfold/platform test`, lint, typecheck, build; browser check on :3091 (list, editor, save,
publish, schedule, duplicate, bulk actions, mobile width).

Follow-up (not in this branch): the test client site template reading the new fields (alt text, canonical,
no-follow, related posts, table of contents, featured/pinned ordering).
