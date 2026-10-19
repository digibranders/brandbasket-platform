/**
 * Compile-time guard against `SiteBookingFields`/`SiteOtpRequest`/`SiteOtpConfirm`/`SiteAvailability`
 * (lib/site-bookings.ts's contract, read by a client site) drifting from what actually produces or validates them:
 * `SiteOtpRequest`/`SiteOtpConfirm` against the zod schemas that validate them on the way in
 * (lib/site-bookings-schema.ts), and `SiteAvailability` against what `buildWeekAvailability`
 * (@brandbasket/shared/lib/appointments/slots.ts) actually returns -- that file's own doc comment says its shapes
 * "must be kept in sync with it by hand", which is exactly the kind of drift only a compile check like this one
 * catches before a client site does. Every field must be assignable both ways.
 *
 * Kept out of lib/site-bookings.ts itself, which client sites keep a verbatim copy of and which should stay
 * nothing but types — `siteOtpRequestSchema`/`siteOtpConfirmSchema` live in the platform-only
 * lib/site-bookings-schema.ts.
 */
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { bookingFieldsSchema } from "@brandbasket/shared/lib/appointments/booking-form";
import { buildWeekAvailability } from "@brandbasket/shared/lib/appointments/slots";
import { siteOtpConfirmSchema, siteOtpRequestSchema } from "./site-bookings-schema";
import type { SiteAvailability, SiteOtpConfirm, SiteOtpRequest } from "./site-bookings";

// booking-form.ts delegates phone parsing to validation/phone.ts, which is marked "server-only" and so throws on
// import outside a server bundle/context; this test runs under plain Node (vitest), so the marker is mocked out
// the same way every other test that touches booking-form.ts (transitively or directly) does.
vi.mock("server-only", () => ({}));

type OtpRequestSchemaType = z.infer<typeof siteOtpRequestSchema>;
type OtpConfirmSchemaType = z.infer<typeof siteOtpConfirmSchema>;
/** buildWeekAvailability's own return type is a shape declared locally in packages/shared (it cannot import
 * apps/platform's SiteAvailability), so this is what actually checks the two stay in sync. */
type BuiltAvailability = ReturnType<typeof buildWeekAvailability>;

/** Compiles only when `Actual` is assignable to `Expected`; used below to assert both directions between two types
 * without collapsing them into one, so a real drift shows up as a compile error at the call site. The constraint
 * clause does the actual checking; the body just echoes `Actual` back so the type parameter isn't "unused". */
type AssertAssignable<Expected, Actual extends Expected> = Actual extends Actual ? true : never;

type RequestSchemaAssignableToContract = AssertAssignable<SiteOtpRequest, OtpRequestSchemaType>;
type RequestContractAssignableToSchema = AssertAssignable<OtpRequestSchemaType, SiteOtpRequest>;
type ConfirmSchemaAssignableToContract = AssertAssignable<SiteOtpConfirm, OtpConfirmSchemaType>;
type ConfirmContractAssignableToSchema = AssertAssignable<OtpConfirmSchemaType, SiteOtpConfirm>;
type AvailabilityBuiltAssignableToContract = AssertAssignable<SiteAvailability, BuiltAvailability>;
type AvailabilityContractAssignableToBuilt = AssertAssignable<BuiltAvailability, SiteAvailability>;

// If any direction stops holding, this line itself fails to compile (a type error on the tuple literal), which is
// the whole point: `pnpm typecheck` catches the drift before any test even runs.
const typesMatchSchemas: [
  RequestSchemaAssignableToContract,
  RequestContractAssignableToSchema,
  ConfirmSchemaAssignableToContract,
  ConfirmContractAssignableToSchema,
  AvailabilityBuiltAssignableToContract,
  AvailabilityContractAssignableToBuilt,
] = [true, true, true, true, true, true];

describe("SiteOtpRequest / SiteOtpConfirm / SiteAvailability contract", () => {
  it("stays assignable both ways with the zod schemas and buildWeekAvailability's return type (enforced above at compile time)", () => {
    expect(typesMatchSchemas).toEqual([true, true, true, true, true, true]);
  });

  it("builds siteOtpRequestSchema's fields on the shared booking-form schema", () => {
    expect(siteOtpRequestSchema.shape.fields).toBe(bookingFieldsSchema);
  });
});
