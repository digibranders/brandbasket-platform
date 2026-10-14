import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  appointmentServices,
  appointmentSettings,
  businesses,
  businessModules,
  practitioners,
  services,
  type BusinessModule,
} from "../schema";

type Runner = Database | ScopedTransaction;

export class InvalidTimeZoneError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid IANA time zone.`);
    this.name = "InvalidTimeZoneError";
  }
}

export class ModuleNeedsTimeZoneError extends Error {
  constructor() {
    super("Set the business's time zone before switching on appointments.");
    this.name = "ModuleNeedsTimeZoneError";
  }
}

export class BusinessNotFoundError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} does not exist.`);
    this.name = "BusinessNotFoundError";
  }
}

/** Thrown by `setBusinessTimeZone` when asked to clear a business's zone while it still has an enabled module --
 * appointments (and every module after it) depends on the zone being set, so clearing it out from under an
 * enabled module would leave the business's dashboard and booking form reading dates in an undefined zone. */
export class TimeZoneInUseError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has an enabled module that needs its time zone set; switch modules off first.`);
    this.name = "TimeZoneInUseError";
  }
}

/**
 * True when `Intl` recognises `value` as a time zone name. Defensive only: the caller is expected to pass the
 * result of shared's `canonicalTimeZone()`, which already validated and canonicalised it. packages/db cannot
 * import @fynix/shared (the dependency points the other way: shared depends on db), so it re-validates here
 * with the same runtime `Intl` support rather than trusting the caller blindly.
 */
function isValidTimeZone(value: string): boolean {
  if (value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Staff set or clear a business's IANA time zone. Callers pass the already-canonical value from shared's
 * canonicalTimeZone() (see isValidTimeZone above for why this only re-checks defensively).
 *
 * Takes a `Database` rather than a `Runner` because it opens its own transaction and locks the business row
 * `FOR UPDATE` first -- the same row, and the same lock, `setBusinessModule` takes before deciding whether a zone
 * is set. That serialises the two against each other: without it, clearing the zone and a concurrent
 * `setBusinessModule` enabling a module on the same business could each read the state before the other's write,
 * so clearing would go through at the same moment enabling decided the zone was there. With both locking the row
 * first, whichever transaction gets the lock decides, and the other sees its result before deciding anything.
 * Clearing (`timeZone: null`) while any module is still enabled throws `TimeZoneInUseError` instead.
 */
export async function setBusinessTimeZone(db: Database, businessId: string, timeZone: string | null): Promise<void> {
  if (timeZone !== null && !isValidTimeZone(timeZone)) throw new InvalidTimeZoneError(timeZone);

  await db.transaction(async (tx) => {
    const business = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .for("update")
      .limit(1);
    if (business[0] === undefined) throw new BusinessNotFoundError(businessId);

    if (timeZone === null) {
      const enabledModules = await listEnabledModules(tx, businessId);
      if (enabledModules.length > 0) throw new TimeZoneInUseError(businessId);
    }

    await tx.update(businesses).set({ timeZone }).where(eq(businesses.id, businessId));
  });
}

export async function findBusinessTimeZone(db: Runner, businessId: string): Promise<string | null> {
  const rows = await db.select({ timeZone: businesses.timeZone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return rows[0]?.timeZone ?? null;
}

export async function listEnabledModules(db: Runner, businessId: string): Promise<BusinessModule[]> {
  const rows = await db
    .select({ module: businessModules.module })
    .from(businessModules)
    .where(and(eq(businessModules.businessId, businessId), eq(businessModules.enabled, true)))
    .orderBy(asc(businessModules.module));
  return rows.map((row) => row.module);
}

export async function isModuleEnabled(db: Runner, businessId: string, module: BusinessModule): Promise<boolean> {
  const rows = await db
    .select({ module: businessModules.module })
    .from(businessModules)
    .where(and(eq(businessModules.businessId, businessId), eq(businessModules.module, module), eq(businessModules.enabled, true)))
    .limit(1);
  return rows.length > 0;
}

export interface ModuleChange {
  readonly businessId: string;
  readonly module: BusinessModule;
  readonly enabled: boolean;
  readonly staffUserId: string;
  readonly now: Date;
}

/** The 80-character limit `appointment_services_name_check` enforces. */
const SERVICE_NAME_MAX_LENGTH = 80;

/** Seeds appointment_services from the business's live onboarding services, but only the first time: if the
 * business already has any appointment_services row (archived or not), nothing changes. */
async function seedAppointmentServicesIfNone(tx: ScopedTransaction, businessId: string): Promise<void> {
  const existing = await tx
    .select({ id: appointmentServices.id })
    .from(appointmentServices)
    .where(eq(appointmentServices.businessId, businessId))
    .limit(1);
  if (existing.length > 0) return;

  const live = await tx
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.businessId, businessId), isNull(services.deletedAt)))
    .orderBy(asc(services.position), asc(services.id));
  if (live.length === 0) return;

  await tx.insert(appointmentServices).values(
    live.map((row, index) => ({
      businessId,
      name: row.name.length > SERVICE_NAME_MAX_LENGTH ? row.name.slice(0, SERVICE_NAME_MAX_LENGTH) : row.name,
      position: index,
    })),
  );
}

/** The 80-character limit `practitioners_name_check` enforces. */
const PRACTITIONER_NAME_MAX_LENGTH = 80;

/**
 * Seeds the business's first practitioner, named after the business, but only when it has none at all (archived or
 * not): every appointment must point at a practitioner, so an appointments business always needs one, and the
 * clinic renames it to the real doctor later. It uses the clinic's own opening hours (`uses_clinic_hours` defaults
 * to true), so booking works exactly as it did before practitioners existed. 0044 backfilled the same default for
 * businesses that already had the module on. setBusinessModule holds the business row FOR UPDATE, so two
 * concurrent switch-ons cannot both see "none" and both insert.
 */
async function seedDefaultPractitionerIfNone(tx: ScopedTransaction, businessId: string, businessName: string): Promise<void> {
  const existing = await tx
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(eq(practitioners.businessId, businessId))
    .limit(1);
  if (existing.length > 0) return;

  await tx.insert(practitioners).values({
    businessId,
    // By code point, the unit char_length counts, so a name is never cut through the middle of a surrogate pair.
    name: Array.from(businessName).slice(0, PRACTITIONER_NAME_MAX_LENGTH).join(""),
    position: 0,
  });
}

/**
 * Staff connection only. Switching appointments on the first time also creates its settings, seeds booking
 * services from the business's live onboarding services and seeds one default practitioner, all in one
 * transaction. Switching off never deletes anything: the settings row, the service list and the practitioners stay
 * exactly as they were, so switching back on does not duplicate services or practitioners or reset preferences.
 * Appointments send no email of any kind, so there is nothing here to notify anyone about.
 */
export async function setBusinessModule(db: Database, change: ModuleChange): Promise<void> {
  await db.transaction(async (tx) => {
    // FOR UPDATE: this read-then-decide also serialises against a concurrent setBusinessTimeZone or another
    // setBusinessModule enabling the same business, so two callers can't both read the same time zone and both
    // decide it's set (or both decide it's missing) before either writes.
    const business = await tx
      .select({ name: businesses.name, timeZone: businesses.timeZone })
      .from(businesses)
      .where(eq(businesses.id, change.businessId))
      .for("update")
      .limit(1);
    const businessRow = business[0];
    if (businessRow === undefined) throw new BusinessNotFoundError(change.businessId);
    if (change.enabled && businessRow.timeZone === null) throw new ModuleNeedsTimeZoneError();

    await tx
      .insert(businessModules)
      .values({
        businessId: change.businessId,
        module: change.module,
        enabled: change.enabled,
        changedAt: change.now,
        changedByUserId: change.staffUserId,
      })
      .onConflictDoUpdate({
        target: [businessModules.businessId, businessModules.module],
        set: { enabled: change.enabled, changedAt: change.now, changedByUserId: change.staffUserId },
      });

    if (change.enabled && change.module === "appointments") {
      await tx
        .insert(appointmentSettings)
        .values({ businessId: change.businessId })
        .onConflictDoNothing({ target: appointmentSettings.businessId });
      await seedAppointmentServicesIfNone(tx, change.businessId);
      await seedDefaultPractitionerIfNone(tx, change.businessId, businessRow.name);
    }
  });
}
