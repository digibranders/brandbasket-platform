import type { BusinessProfile, MediaAsset, PrimaryDomain, Project, Service } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { onboardingChecklist } from "@brandbasket/shared/lib/onboarding/checklist";
import {
  checklistInputFrom,
  completedStepKeys,
  isOnboardingLocked,
  openingHoursFromRows,
  type OnboardingSnapshot,
} from "./snapshot";

const NOW = new Date("2026-09-16T10:00:00Z");
const BUSINESS_ID = "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d00";

const PROJECT: Project = {
  id: "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d10",
  businessId: BUSINESS_ID,
  kind: "initial_build",
  status: "onboarding",
  onboardingSubmittedAt: null,
  slaDueAt: null,
  previewUrl: null,
  previewSentAt: null,
  onHoldReason: null,
  revisionRoundsIncluded: 2,
  revisionRoundsGranted: 0,
  launchedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const PROFILE: BusinessProfile = {
  businessId: BUSINESS_ID,
  displayName: "Bloom Dental",
  tagline: null,
  description: null,
  phone: "+91 98765 43210",
  email: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  serviceAreas: null,
  googleBusinessUrl: null,
  updatedAt: NOW,
};

function service(name: string): Service {
  return { id: `id-${name}`, name, summary: null, priceText: null, position: 0, createdAt: NOW, updatedAt: NOW };
}

function photo(id: string, altText: string | null): MediaAsset {
  return {
    id,
    businessId: BUSINESS_ID,
    purpose: "photo",
    storageKey: `t/${BUSINESS_ID}/${id}/display`,
    originalFilename: "photo.jpg",
    mimeType: "image/webp",
    bytes: 100,
    width: 10,
    height: 10,
    sha256: "0".repeat(64),
    altText,
    status: "ready",
    uploadedByUserId: "user-1",
    createdAt: NOW,
  };
}

const DOMAIN: PrimaryDomain = {
  id: "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d20",
  hostname: "bloomdental.com",
  status: "pending",
  ownerConfirmedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

function snapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    project: PROJECT,
    locked: false,
    completed: [],
    profile: PROFILE,
    hours: [],
    services: [service("Check-up")],
    brief: null,
    domain: DOMAIN,
    logo: null,
    photos: [photo("p1", "Front desk")],
    ...overrides,
  };
}

describe("isOnboardingLocked", () => {
  it("is open only while the project is in onboarding", () => {
    expect(isOnboardingLocked(PROJECT)).toBe(false);
    expect(isOnboardingLocked({ status: "submitted" })).toBe(true);
    expect(isOnboardingLocked({ status: "on_hold" })).toBe(true);
    expect(isOnboardingLocked(null)).toBe(true);
  });
});

describe("completedStepKeys", () => {
  it("lists recorded steps in step order", () => {
    expect(
      completedStepKeys(
        [
          { step: "domain", completedAt: NOW },
          { step: "business", completedAt: NOW },
          { step: "content", completedAt: null },
        ],
        false,
      ),
    ).toEqual(["business", "domain"]);
  });

  it("marks every step done once onboarding is sent", () => {
    expect(completedStepKeys([], true)).toEqual(["business", "content", "brand", "domain", "review"]);
  });
});

describe("openingHoursFromRows", () => {
  it("drops the seconds Postgres adds, reads every kind of day, and keeps one row per day, in day order", () => {
    expect(
      openingHoursFromRows([
        { id: "a", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "13:00:00", closed: false, openAllDay: false },
        { id: "b", dayOfWeek: 0, opensAt: "14:00:00", closesAt: "18:00:00", closed: false, openAllDay: false },
        { id: "d", dayOfWeek: 4, opensAt: "18:00:00", closesAt: "02:00:00", closed: false, openAllDay: false },
        { id: "e", dayOfWeek: 5, opensAt: null, closesAt: null, closed: false, openAllDay: true },
        { id: "c", dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
      ]),
    ).toEqual([
      { dayOfWeek: 0, mode: "open", opensAt: "09:00", closesAt: "13:00" },
      { dayOfWeek: 4, mode: "open", opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 5, mode: "all-day" },
      { dayOfWeek: 6, mode: "closed" },
    ]);
  });
});

describe("checklistInputFrom", () => {
  it("passes every item for a complete snapshot", () => {
    expect(onboardingChecklist(checklistInputFrom(snapshot())).every((item) => item.passed)).toBe(true);
  });

  it("reads a missing profile as no name and no contact", () => {
    expect(checklistInputFrom(snapshot({ profile: null }))).toMatchObject({ displayName: null, phone: null, email: null });
  });

  it("treats blank contact details as missing", () => {
    expect(checklistInputFrom(snapshot({ profile: { ...PROFILE, phone: "  ", email: "" } }))).toMatchObject({
      phone: null,
      email: null,
    });
  });

  it("counts undescribed photos, blank descriptions included", () => {
    expect(
      checklistInputFrom(snapshot({ photos: [photo("p1", null), photo("p2", " "), photo("p3", "Team")] })),
    ).toMatchObject({ photoCount: 3, undescribedPhotoCount: 2 });
  });

  it("counts the logo", () => {
    expect(checklistInputFrom(snapshot({ logo: { ...photo("l1", null), purpose: "logo" }, photos: [] }))).toMatchObject({
      logoCount: 1,
      photoCount: 0,
      undescribedPhotoCount: 0,
    });
  });

  it("reports whether the domain was confirmed", () => {
    expect(checklistInputFrom(snapshot({ domain: { ...DOMAIN, ownerConfirmedAt: null } })).domain).toEqual({
      hostname: "bloomdental.com",
      ownerConfirmed: false,
    });
    expect(checklistInputFrom(snapshot({ domain: null })).domain).toBeNull();
  });
});
