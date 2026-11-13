import type { BusinessProfile, MediaAsset, PrimaryDomain, Project, Service } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { checklistRows, CHECKLIST_KEYS, isChecklistKey, itemsFor, websiteItemDone } from "./rules-items";
import type { OnboardingSnapshot } from "./rules-snapshot";

const NOW = new Date("2026-11-03T10:00:00Z");

const PROJECT = { id: "p1", status: "onboarding" } as unknown as Project;
const PROFILE = { displayName: "Bloom Dental", phone: "+919820011223", email: null } as unknown as BusinessProfile;
const DOMAIN = { id: "d1", hostname: "bloom.example", status: "pending", ownerConfirmedAt: NOW, createdAt: NOW, updatedAt: NOW } as PrimaryDomain;
const SERVICE = { id: "s1", name: "Check-up" } as unknown as Service;
const LOGO = { id: "l1", purpose: "logo", altText: null } as unknown as MediaAsset;
const PHOTO = (altText: string | null) => ({ id: "ph1", purpose: "photo", altText }) as unknown as MediaAsset;

function snapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    project: PROJECT,
    locked: false,
    completed: ["business", "content", "brand", "domain"],
    profile: PROFILE,
    hours: [],
    services: [SERVICE],
    brief: null,
    domain: DOMAIN,
    logo: LOGO,
    photos: [],
    ...overrides,
  };
}

const NO_ANSWERS = { social: undefined, search: undefined };

describe("itemsFor", () => {
  it("lists every item for all three services, in the page's order, and never asks for offers", () => {
    expect(itemsFor(["website", "social", "search"]).map((item) => item.key)).toEqual(["business", "brand", "services", "domain", "accounts", "budget", "areas"]);
    expect(CHECKLIST_KEYS).not.toContain("offers");
  });

  it("only lists the services on the plan", () => {
    expect(itemsFor(["social"]).map((item) => item.key)).toEqual(["accounts", "budget"]);
    expect(itemsFor(["search"]).map((item) => item.key)).toEqual(["areas"]);
    expect(itemsFor(["website"]).map((item) => item.service)).toEqual(["website", "website", "website", "website"]);
  });
});

describe("isChecklistKey", () => {
  it("accepts a key and refuses anything else, including offers", () => {
    expect(isChecklistKey("brand")).toBe(true);
    expect(isChecklistKey("offers")).toBe(false);
    expect(isChecklistKey(undefined)).toBe(false);
  });
});

describe("websiteItemDone", () => {
  it("is done when the step was saved and what is stored still passes", () => {
    expect(websiteItemDone("business", snapshot())).toBe(true);
    expect(websiteItemDone("brand", snapshot())).toBe(true);
    expect(websiteItemDone("domain", snapshot())).toBe(true);
    expect(websiteItemDone("content", snapshot())).toBe(true);
  });

  it("is open until the step is saved", () => {
    expect(websiteItemDone("brand", snapshot({ completed: ["business"] }))).toBe(false);
  });

  it("reopens when the stored answer no longer passes the checks", () => {
    expect(websiteItemDone("brand", snapshot({ logo: null, photos: [] }))).toBe(false);
    expect(websiteItemDone("brand", snapshot({ logo: null, photos: [PHOTO(null)] }))).toBe(false);
    expect(websiteItemDone("brand", snapshot({ logo: null, photos: [PHOTO("Front desk")] }))).toBe(true);
    expect(websiteItemDone("content", snapshot({ services: [] }))).toBe(false);
    expect(websiteItemDone("domain", snapshot({ domain: { ...DOMAIN, ownerConfirmedAt: null } }))).toBe(false);
    expect(websiteItemDone("business", snapshot({ profile: { ...PROFILE, phone: null } as BusinessProfile }))).toBe(false);
  });

  it("reads every website item as done once the project has left onboarding", () => {
    const locked = snapshot({ locked: true, completed: [], logo: null, services: [], domain: null, profile: null });
    for (const step of ["business", "content", "brand", "domain"] as const) expect(websiteItemDone(step, locked)).toBe(true);
  });
});

describe("checklistRows", () => {
  it("puts open items first and keeps each group in list order", () => {
    const rows = checklistRows(["website", "social", "search"], snapshot({ completed: ["business", "domain"] }), {
      social: { instagramUrl: "https://instagram.com/bloom" },
      search: undefined,
    });
    expect(rows.map((row) => `${row.item.key}:${row.done}`)).toEqual([
      "brand:false",
      "services:false",
      "budget:false",
      "areas:false",
      "business:true",
      "domain:true",
      "accounts:true",
    ]);
  });

  it("reads Social and Search items from the saved answers", () => {
    const rows = checklistRows(["social", "search"], null, {
      social: { adBudgetRupees: 5000, adArea: "4 km around the clinic" },
      search: { areas: "Naupada" },
    });
    expect(Object.fromEntries(rows.map((row) => [row.item.key, row.done]))).toEqual({ accounts: false, budget: true, areas: true });
  });

  it("shows no website items when the plan has no website", () => {
    expect(checklistRows(["social"], null, NO_ANSWERS).every((row) => row.item.service === "social")).toBe(true);
  });
});
