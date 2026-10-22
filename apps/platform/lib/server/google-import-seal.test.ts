import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { IMPORT_LIFETIME_MS, openGoogleImport, SEALED_IMPORT_MAX_LENGTH, sealGoogleImport } = await import("./google-import-seal");
type ImportedLocation = import("./google-import-seal").ImportedLocation;

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const OTHER = "0192f3c4-2222-7000-8000-000000000002";
const NOW = new Date("2026-10-01T06:00:00.000Z");

const LOCATION: ImportedLocation = {
  id: "locations/123",
  name: "Gentle Dental",
  address: "12 Gokhale Road, Naupada, Thane 400602",
  phone: "+91 98200 77001",
  website: "https://gentledental.in/",
  mapsUrl: "https://maps.google.com/maps?cid=123",
  about: "Family dentist since 2004.",
  hours: [
    { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "18:00" },
    { dayOfWeek: 6, mode: "closed" },
  ],
};

function sealed(locations: readonly ImportedLocation[] = [LOCATION]): string {
  const value = sealGoogleImport(SECRET, { businessId: BUSINESS, locations, now: NOW });
  if (value === null) throw new Error("Expected the import to seal");
  return value;
}

describe("google import seal", () => {
  it("opens what it sealed, for the same business, within ten minutes", () => {
    expect(openGoogleImport(SECRET, { sealed: sealed(), businessId: BUSINESS, now: NOW })).toEqual([LOCATION]);
  });

  it("refuses another business, an expired seal, another key and a changed value", () => {
    const value = sealed();
    expect(openGoogleImport(SECRET, { sealed: value, businessId: OTHER, now: NOW })).toBeNull();
    expect(openGoogleImport(SECRET, { sealed: value, businessId: BUSINESS, now: new Date(NOW.getTime() + IMPORT_LIFETIME_MS) })).toBeNull();
    expect(openGoogleImport("another-secret-that-is-at-least-32-characters", { sealed: value, businessId: BUSINESS, now: NOW })).toBeNull();
    // Replace the character being tampered with by a different one, whatever it was.
    const flipped = `${value.slice(0, -2)}${value.at(-2) === "A" ? "B" : "A"}${value.slice(-1)}`;
    expect(openGoogleImport(SECRET, { sealed: flipped, businessId: BUSINESS, now: NOW })).toBeNull();
    expect(openGoogleImport(SECRET, { sealed: "not-a-seal", businessId: BUSINESS, now: NOW })).toBeNull();
  });

  it("keeps only as many locations as fit in a cookie", () => {
    const long = Array.from({ length: 12 }, (_, index) => ({
      ...LOCATION,
      id: `locations/${String(index)}`,
      // Random text, so compression cannot shrink it below a cookie's size.
      about: randomBytes(250).toString("hex"),
    }));
    const value = sealed(long);
    expect(value.length).toBeLessThanOrEqual(SEALED_IMPORT_MAX_LENGTH);
    const opened = openGoogleImport(SECRET, { sealed: value, businessId: BUSINESS, now: NOW });
    expect(opened?.length).toBeGreaterThan(0);
    expect(opened?.length).toBeLessThan(12);
    expect(opened?.[0]?.id).toBe("locations/0");
  });
});
