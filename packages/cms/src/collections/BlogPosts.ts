import type { CollectionConfig } from "payload";

/**
 * One blog post for a business. `body` uses Payload's own `richText` field (lexical editor, configured in
 * payload.config.ts) — a real rich-text editor "basically free" compared to the earlier plain-text plan (see Task
 * 6). Access denies everything by default, for the same reason as `Pages`/`Gallery`/`Media` (see
 * collections/Media.ts's doc comment): every legitimate caller uses the Local API with `overrideAccess: true`, and
 * that's a Local-API-only parameter no REST or GraphQL request can set — a request through Payload's own HTTP API
 * must be refused outright, not just routed away by a Host-header check.
 */
export const BlogPosts: CollectionConfig = {
  slug: "blogPosts",
  admin: { useAsTitle: "title" },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    // Addresses this post had before the customer changed it. Client sites redirect them to the current one, so a
    // shared link never breaks. A list of strings; written only by content/blog/actions.ts.
    { name: "previousSlugs", type: "json" },
    { name: "excerpt", type: "text" },
    { name: "body", type: "richText" },
    { name: "coverImage", type: "upload", relationTo: "media" },
    // Describes the cover image for people using screen readers and for search engines. Blank means none written.
    { name: "coverImageAlt", type: "text" },
    // The first part of this article's address on the business's website: "blog" gives /blog/<slug>. Empty means
    // "blog". See apps/platform/lib/post-path.ts.
    { name: "pathPrefix", type: "text" },
    { name: "category", type: "relationship", relationTo: "blogCategories" },
    { name: "author", type: "relationship", relationTo: "blogAuthors" },
    // Search-engine settings. Blank means "use the default" (apps/platform/lib/blog-seo.ts's resolveSeo), so a
    // customer who never opens the section still gets a sensible title and description.
    { name: "metaTitle", type: "text" },
    { name: "metaDescription", type: "text" },
    { name: "noIndex", type: "checkbox", defaultValue: false },
    {
      name: "status",
      type: "select",
      options: ["draft", "published"],
      defaultValue: "draft",
      required: true,
    },
    { name: "publishedAt", type: "date" },
  ],
};
