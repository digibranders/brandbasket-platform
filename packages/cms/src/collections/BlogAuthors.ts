import type { CollectionConfig } from "payload";

/**
 * Someone who writes a business's blog posts: a name, and optionally a photo, their role, a one-line bio and links to
 * their profiles, shown on the post and named in its schema.org data. Edited on the dashboard's Content → Authors
 * screen. Access denies everything for the same reason as BlogPosts.
 */
export const BlogAuthors: CollectionConfig = {
  slug: "blogAuthors",
  admin: { useAsTitle: "name" },
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "name", type: "text", required: true },
    { name: "bio", type: "text" },
    { name: "photo", type: "upload", relationTo: "media" },
    // What they do, e.g. "Head physiotherapist".
    { name: "role", type: "text" },
    // Full http(s) addresses, checked by content/authors/actions.ts, the only writer. Blank means none.
    { name: "website", type: "text" },
    { name: "instagram", type: "text" },
    { name: "facebook", type: "text" },
    { name: "linkedin", type: "text" },
    { name: "x", type: "text" },
  ],
};
