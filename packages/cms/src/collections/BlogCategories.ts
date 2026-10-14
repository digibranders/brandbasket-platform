import type { CollectionConfig } from "payload";

/**
 * One blog category belonging to one business. A post has at most one (BlogPosts.category). `slug` is the address
 * a client site gives the category's page (`/blog/category/<slug>`), unique within the business — enforced by its two
 * writers, `content/categories/actions.ts` and the post editor's inline "New category"
 * (`content/blog/taxonomy-actions.ts`). Access denies everything for the reason given in collections/BlogPosts.ts:
 * every legitimate caller uses the Local API with `overrideAccess: true`.
 */
export const BlogCategories: CollectionConfig = {
  slug: "blogCategories",
  admin: { useAsTitle: "name" },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    // A line or two about what the category covers, shown on its page on the website.
    { name: "description", type: "text" },
    // Search-engine title and description for the category's page. Blank means the default (name / description).
    { name: "metaTitle", type: "text" },
    { name: "metaDescription", type: "text" },
  ],
};
