/**
 * Every upload route in this app hands a new `media` document's id back to the browser as a JSON string
 * (`String(media.id)` — see app/api/admin-content-media/route.ts and app/api/content-media-uploads/route.ts), but
 * `@payloadcms/db-postgres` defaults every collection's id column to `serial` — an integer. Payload's own
 * relationship-field validator rejects a numeric-looking id given as a string: it iterates the string's
 * *characters* as if it were a list of ids, producing a confusing "invalid relationships: 2 0"-style error for id
 * "20". Converting back to a number here, right where the string first arrives from JSON, keeps that transport
 * detail out of every caller's own id-type-agnostic `string | number` plumbing (e.g. `content-fields.ts`'s
 * `PageFieldRow.image`). Left as-is when the string isn't purely digits, for a collection that ever used a
 * non-numeric id (Payload also supports text/UUID ids).
 *
 * No `server-only` marker: this package is loaded by the `payload migrate` CLI under plain Node, and the function
 * is a pure string-to-id conversion with nothing to protect.
 *
 * Shared by every place that attaches an already-uploaded media id to another document: the admin's
 * content-slot editor (`app/admin-host/(protected)/clients/[businessId]/content/actions.ts`), the customer's
 * gallery (`app/app-host/(protected)/content/actions.ts`) and the customer's blog cover image
 * (`app/app-host/(protected)/content/blog/actions.ts`).
 */
export function toRelationId(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value;
}
