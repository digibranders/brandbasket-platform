/**
 * Upload limits shared by the browser and the server. Vercel refuses a request body over 4.5 MB before any of our
 * code runs, so the byte limit sits under that; the upload route is outside the proxy, so no other body limit
 * applies to it.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** How the limit reads in a message to the customer. */
export const MAX_UPLOAD_SIZE_LABEL = "4 MB";
/** Stored images fit within this many pixels on each side, and the browser shrinks to the same bound. */
export const MAX_IMAGE_DIMENSION = 2400;
/** What the server will store. The browser also converts other formats it can decode into one of these. */
export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedUploadType = (typeof ACCEPTED_UPLOAD_TYPES)[number];

export const UPLOAD_PURPOSES = ["logo", "photo"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** The header carrying the original file name, percent-encoded because header values are Latin-1 only. */
export const UPLOAD_FILE_NAME_HEADER = "X-File-Name";

/** The header carrying which business a `media` upload belongs to (see collections/Media.ts's `businessId` field
 * and app/api/admin-content-media/route.ts). Only ever trusted from a staff session — the single-admin model gives
 * staff blanket access to every business, so a staff-supplied businessId here is not a privilege-escalation risk
 * the way a customer-supplied one would be. */
export const UPLOAD_BUSINESS_ID_HEADER = "X-Business-Id";

export const TOO_LARGE_MESSAGE = `That file is larger than ${MAX_UPLOAD_SIZE_LABEL}. Please upload a smaller image.`;

export function isAcceptedUploadType(type: string): type is AcceptedUploadType {
  return (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(type);
}

export function isUploadPurpose(value: string | null): value is UploadPurpose {
  return value !== null && (UPLOAD_PURPOSES as readonly string[]).includes(value);
}
