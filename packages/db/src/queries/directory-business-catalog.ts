import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  BUSINESS_CATALOG_MAX_ITEMS,
  BUSINESS_FAQ_MAX_ITEMS,
  businesses,
  directoryBusinessFaqs,
  directoryBusinessProducts,
  directoryBusinessServices,
  directoryClaims,
  type BusinessProductAvailability,
} from "../schema";
import { businessUrlCode } from "../place-id";
import type { ScopedTransaction } from "../scope";

/*
 * The Services, Products and FAQ tabs of the Business profile (see schema/directory-business-catalog.ts). Reads work through
 * row-level security (the customer reads its own rows) and on staff; every write is on the staff connection after the
 * platform has checked the customer and parsed the form. A business keeps at most BUSINESS_CATALOG_MAX_ITEMS services
 * and products (BUSINESS_FAQ_MAX_ITEMS questions),
 * counted under the business's row lock so two adds cannot both take the last place.
 */

type Runner = Database | ScopedTransaction;

export interface BusinessService {
  readonly id: string;
  readonly category: string;
  readonly name: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly priceInr: number | null;
  readonly durationMinutes: number | null;
  readonly serviceArea: string | null;
}

export interface BusinessProduct {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceInr: number | null;
  readonly category: string | null;
  readonly availability: BusinessProductAvailability;
  /** The product's own photo (docs/superpowers/specs/2026-10-12-product-photos-design.md), or null. A new photo is a new id. */
  readonly photoId: string | null;
}

export interface BusinessFaq {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

/** A service as the owner types it, already checked and trimmed; `id` is the row's, not the owner's. */
export type BusinessServiceInput = Omit<BusinessService, "id">;
/** A product as the owner types it: the photo is added and removed on its own, never by the form. */
export type BusinessProductInput = Omit<BusinessProduct, "id" | "photoId">;
export type BusinessFaqInput = Omit<BusinessFaq, "id">;

export type CatalogWriteOutcome =
  | { readonly kind: "saved"; readonly id: string }
  /** The business already lists the most it can (BUSINESS_CATALOG_MAX_ITEMS, or BUSINESS_FAQ_MAX_ITEMS questions). */
  | { readonly kind: "full" }
  /** No such item on this business. */
  | { readonly kind: "not-found" };

export async function listBusinessServices(db: Runner, businessId: string): Promise<readonly BusinessService[]> {
  const rows = await db
    .select()
    .from(directoryBusinessServices)
    .where(eq(directoryBusinessServices.businessId, businessId))
    .orderBy(asc(directoryBusinessServices.position), asc(directoryBusinessServices.createdAt));
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    summary: row.summary,
    description: row.description,
    priceInr: row.priceInr,
    durationMinutes: row.durationMinutes,
    serviceArea: row.serviceArea,
  }));
}

export async function listBusinessProducts(db: Runner, businessId: string): Promise<readonly BusinessProduct[]> {
  const rows = await db
    .select()
    .from(directoryBusinessProducts)
    .where(eq(directoryBusinessProducts.businessId, businessId))
    .orderBy(asc(directoryBusinessProducts.position), asc(directoryBusinessProducts.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priceInr: row.priceInr,
    category: row.category,
    // The column's CHECK allows only these three (0084).
    availability: row.availability as BusinessProductAvailability,
    photoId: row.photoId,
  }));
}

/** Takes the business's row lock, so the count and the insert that follows are one step. */
async function lockBusiness(tx: Pick<Database, "select">, businessId: string): Promise<void> {
  await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for("update");
}

export async function addBusinessService(db: Database, input: { readonly businessId: string; readonly service: BusinessServiceInput }): Promise<CatalogWriteOutcome> {
  return db.transaction(async (tx) => {
    await lockBusiness(tx, input.businessId);
    const counted = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryBusinessServices)
      .where(eq(directoryBusinessServices.businessId, input.businessId));
    const count = counted[0]?.count ?? 0;
    if (count >= BUSINESS_CATALOG_MAX_ITEMS) return { kind: "full" };
    const rows = await tx
      .insert(directoryBusinessServices)
      .values({ businessId: input.businessId, ...input.service, position: count })
      .returning({ id: directoryBusinessServices.id });
    const row = rows[0];
    if (row === undefined) throw new Error("The service was not saved: the insert returned no row.");
    return { kind: "saved", id: row.id };
  });
}

export async function updateBusinessService(
  db: Database,
  input: { readonly businessId: string; readonly id: string; readonly service: BusinessServiceInput },
): Promise<CatalogWriteOutcome> {
  const rows = await db
    .update(directoryBusinessServices)
    .set(input.service)
    .where(and(eq(directoryBusinessServices.id, input.id), eq(directoryBusinessServices.businessId, input.businessId)))
    .returning({ id: directoryBusinessServices.id });
  return rows[0] === undefined ? { kind: "not-found" } : { kind: "saved", id: rows[0].id };
}

export async function deleteBusinessService(db: Database, input: { readonly businessId: string; readonly id: string }): Promise<boolean> {
  const rows = await db
    .delete(directoryBusinessServices)
    .where(and(eq(directoryBusinessServices.id, input.id), eq(directoryBusinessServices.businessId, input.businessId)))
    .returning({ id: directoryBusinessServices.id });
  return rows.length > 0;
}

export async function addBusinessProduct(db: Database, input: { readonly businessId: string; readonly product: BusinessProductInput }): Promise<CatalogWriteOutcome> {
  return db.transaction(async (tx) => {
    await lockBusiness(tx, input.businessId);
    const counted = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryBusinessProducts)
      .where(eq(directoryBusinessProducts.businessId, input.businessId));
    const count = counted[0]?.count ?? 0;
    if (count >= BUSINESS_CATALOG_MAX_ITEMS) return { kind: "full" };
    const rows = await tx
      .insert(directoryBusinessProducts)
      .values({ businessId: input.businessId, ...input.product, position: count })
      .returning({ id: directoryBusinessProducts.id });
    const row = rows[0];
    if (row === undefined) throw new Error("The product was not saved: the insert returned no row.");
    return { kind: "saved", id: row.id };
  });
}

export async function updateBusinessProduct(
  db: Database,
  input: { readonly businessId: string; readonly id: string; readonly product: BusinessProductInput },
): Promise<CatalogWriteOutcome> {
  const rows = await db
    .update(directoryBusinessProducts)
    .set(input.product)
    .where(and(eq(directoryBusinessProducts.id, input.id), eq(directoryBusinessProducts.businessId, input.businessId)))
    .returning({ id: directoryBusinessProducts.id });
  return rows[0] === undefined ? { kind: "not-found" } : { kind: "saved", id: rows[0].id };
}

/** Deletes a product; `photoId` is the photo it had, whose file the caller then deletes. */
export async function deleteBusinessProduct(
  db: Database,
  input: { readonly businessId: string; readonly id: string },
): Promise<{ readonly deleted: boolean; readonly photoId: string | null }> {
  const rows = await db
    .delete(directoryBusinessProducts)
    .where(and(eq(directoryBusinessProducts.id, input.id), eq(directoryBusinessProducts.businessId, input.businessId)))
    .returning({ id: directoryBusinessProducts.id, photoId: directoryBusinessProducts.photoId });
  const row = rows[0];
  return row === undefined ? { deleted: false, photoId: null } : { deleted: true, photoId: row.photoId };
}

/** A stored product photo as it is recorded: everything but the key, which is built from the ids. */
export interface ProductPhotoRecord {
  readonly photoId: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export type SetProductPhotoOutcome =
  /** `replacedPhotoId` is the photo it took the place of, whose file the caller then deletes. */
  | { readonly kind: "saved"; readonly replacedPhotoId: string | null }
  /** No such product on this business. */
  | { readonly kind: "not-found" };

/** Puts a stored photo on a product, in place of any it had. Staff connection, after the platform has checked the customer. */
export async function setBusinessProductPhoto(
  db: Database,
  input: { readonly businessId: string; readonly productId: string; readonly photo: ProductPhotoRecord },
): Promise<SetProductPhotoOutcome> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ photoId: directoryBusinessProducts.photoId })
      .from(directoryBusinessProducts)
      .where(and(eq(directoryBusinessProducts.id, input.productId), eq(directoryBusinessProducts.businessId, input.businessId)))
      .limit(1)
      .for("update");
    const row = found[0];
    if (row === undefined) return { kind: "not-found" };
    await tx
      .update(directoryBusinessProducts)
      .set({
        photoId: input.photo.photoId,
        photoMime: input.photo.mimeType,
        photoBytes: input.photo.bytes,
        photoWidth: input.photo.width,
        photoHeight: input.photo.height,
        photoSha256: input.photo.sha256,
      })
      .where(eq(directoryBusinessProducts.id, input.productId));
    return { kind: "saved", replacedPhotoId: row.photoId };
  });
}

/** Takes a product's photo off it and returns the photo's id, for its file to be deleted; null when it had none. */
export async function clearBusinessProductPhoto(db: Database, input: { readonly businessId: string; readonly productId: string }): Promise<string | null> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ photoId: directoryBusinessProducts.photoId })
      .from(directoryBusinessProducts)
      .where(and(eq(directoryBusinessProducts.id, input.productId), eq(directoryBusinessProducts.businessId, input.businessId)))
      .limit(1)
      .for("update");
    const photoId = found[0]?.photoId ?? null;
    if (photoId === null) return null;
    await tx
      .update(directoryBusinessProducts)
      .set({ photoId: null, photoMime: null, photoBytes: null, photoWidth: null, photoHeight: null, photoSha256: null })
      .where(eq(directoryBusinessProducts.id, input.productId));
    return photoId;
  });
}

/** What serving a product photo needs: where its file is and what it is. */
export interface ProductPhotoFile {
  readonly storageKey: string;
  readonly mimeType: string;
  /** Hex SHA-256 of the stored file. */
  readonly sha256: string;
}

const PHOTO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function productPhotoFile(row: { businessId: string; photoId: string | null; photoMime: string | null; photoSha256: string | null }): ProductPhotoFile | null {
  if (row.photoId === null || row.photoMime === null || row.photoSha256 === null) return null;
  return { storageKey: `t/${row.businessId}/${row.photoId}/display`, mimeType: row.photoMime, sha256: row.photoSha256 };
}

const PHOTO_COLUMNS = {
  businessId: directoryBusinessProducts.businessId,
  photoId: directoryBusinessProducts.photoId,
  photoMime: directoryBusinessProducts.photoMime,
  photoSha256: directoryBusinessProducts.photoSha256,
} as const;

/** One of the business's own product photos, for the owner to see in the dashboard. Another business's photo and anything that is not an id are not found. */
export async function findOwnProductPhotoFile(db: Runner, businessId: string, photoId: string): Promise<ProductPhotoFile | null> {
  if (!PHOTO_ID_PATTERN.test(photoId)) return null;
  const rows = await db
    .select(PHOTO_COLUMNS)
    .from(directoryBusinessProducts)
    .where(and(eq(directoryBusinessProducts.photoId, photoId), eq(directoryBusinessProducts.businessId, businessId)))
    .limit(1);
  return rows[0] === undefined ? null : productPhotoFile(rows[0]);
}

/**
 * A product photo the website may show: the product still has it and its business's listing is approved. Staff
 * connection: the website's shared secret has already been checked.
 */
export async function findLiveProductPhotoFile(db: Database, photoId: string): Promise<ProductPhotoFile | null> {
  if (!PHOTO_ID_PATTERN.test(photoId)) return null;
  const rows = await db
    .select(PHOTO_COLUMNS)
    .from(directoryBusinessProducts)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryBusinessProducts.businessId))
    .where(and(eq(directoryBusinessProducts.photoId, photoId), eq(directoryClaims.status, "approved")))
    .limit(1);
  return rows[0] === undefined ? null : productPhotoFile(rows[0]);
}

/**
 * A product photo the owner's live preview may show for a business that is not live yet: the product still has it, its
 * claim was not refused, and its business's page address (`code`) is the one the preview was opened for. Staff connection.
 */
export async function findPreviewProductPhotoFile(db: Database, photoId: string, code: string): Promise<ProductPhotoFile | null> {
  if (!PHOTO_ID_PATTERN.test(photoId)) return null;
  const rows = await db
    .select({ ...PHOTO_COLUMNS, placeId: directoryClaims.placeId })
    .from(directoryBusinessProducts)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryBusinessProducts.businessId))
    .where(and(eq(directoryBusinessProducts.photoId, photoId), ne(directoryClaims.status, "rejected")))
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.placeId === null || businessUrlCode(row.placeId) !== code) return null;
  return productPhotoFile(row);
}

/** Every stored product photo of a business, for deleting their files when the business is erased. */
export async function listBusinessProductPhotoIds(db: Runner, businessId: string): Promise<readonly string[]> {
  const rows = await db
    .select({ photoId: directoryBusinessProducts.photoId })
    .from(directoryBusinessProducts)
    .where(and(eq(directoryBusinessProducts.businessId, businessId), isNotNull(directoryBusinessProducts.photoId)));
  return rows.flatMap((row) => (row.photoId === null ? [] : [row.photoId]));
}

export async function listBusinessFaqs(db: Runner, businessId: string): Promise<readonly BusinessFaq[]> {
  const rows = await db
    .select()
    .from(directoryBusinessFaqs)
    .where(eq(directoryBusinessFaqs.businessId, businessId))
    .orderBy(asc(directoryBusinessFaqs.position), asc(directoryBusinessFaqs.createdAt));
  return rows.map((row) => ({ id: row.id, question: row.question, answer: row.answer }));
}

export async function addBusinessFaq(db: Database, input: { readonly businessId: string; readonly faq: BusinessFaqInput }): Promise<CatalogWriteOutcome> {
  return db.transaction(async (tx) => {
    await lockBusiness(tx, input.businessId);
    const counted = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryBusinessFaqs)
      .where(eq(directoryBusinessFaqs.businessId, input.businessId));
    const count = counted[0]?.count ?? 0;
    if (count >= BUSINESS_FAQ_MAX_ITEMS) return { kind: "full" };
    const rows = await tx
      .insert(directoryBusinessFaqs)
      .values({ businessId: input.businessId, ...input.faq, position: count })
      .returning({ id: directoryBusinessFaqs.id });
    const row = rows[0];
    if (row === undefined) throw new Error("The question was not saved: the insert returned no row.");
    return { kind: "saved", id: row.id };
  });
}

export async function updateBusinessFaq(db: Database, input: { readonly businessId: string; readonly id: string; readonly faq: BusinessFaqInput }): Promise<CatalogWriteOutcome> {
  const rows = await db
    .update(directoryBusinessFaqs)
    .set(input.faq)
    .where(and(eq(directoryBusinessFaqs.id, input.id), eq(directoryBusinessFaqs.businessId, input.businessId)))
    .returning({ id: directoryBusinessFaqs.id });
  return rows[0] === undefined ? { kind: "not-found" } : { kind: "saved", id: rows[0].id };
}

export async function deleteBusinessFaq(db: Database, input: { readonly businessId: string; readonly id: string }): Promise<boolean> {
  const rows = await db
    .delete(directoryBusinessFaqs)
    .where(and(eq(directoryBusinessFaqs.id, input.id), eq(directoryBusinessFaqs.businessId, input.businessId)))
    .returning({ id: directoryBusinessFaqs.id });
  return rows.length > 0;
}
