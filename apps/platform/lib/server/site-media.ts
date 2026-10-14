import "server-only";
import { getPayload, type Where } from "payload";
import config from "@/payload.config";

/**
 * Whether a media document may be shown to the public: it is the cover image of a published post, or the photo of an
 * author who has a published post. Everything else a customer uploads (drafts, unused files) stays private.
 *
 * A client website's visitors load these images straight from the browser, which cannot send the site API's bearer
 * token, so the image route is public; this check is what keeps it from serving the whole media library.
 */
export async function isMediaPublished(mediaId: string, now: Date = new Date()): Promise<boolean> {
  const payload = await getPayload({ config });
  const published: Where[] = [
    { status: { equals: "published" } },
    { or: [{ publishedAt: { less_than_equal: now.toISOString() } }, { publishedAt: { exists: false } }] },
  ];

  const asCover = await payload.find({
    collection: "blogPosts",
    where: { and: [{ coverImage: { equals: mediaId } }, ...published] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  });
  if (asCover.docs.length > 0) return true;

  const authors = await payload.find({
    collection: "blogAuthors",
    where: { photo: { equals: mediaId } },
    depth: 0,
    limit: 50,
    pagination: false,
    overrideAccess: true,
  });
  if (authors.docs.length === 0) return false;

  const byAuthor = await payload.find({
    collection: "blogPosts",
    where: { and: [{ author: { in: authors.docs.map((author) => author.id) } }, ...published] },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  });
  return byAuthor.docs.length > 0;
}
