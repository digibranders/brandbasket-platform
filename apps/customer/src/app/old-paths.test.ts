import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Old customer URLs from docs/customer-app-v4/PARITY.md Part 2 (sections 2.1 and 2.3).
// Each one must still have a page.tsx or route.ts in this app, either rendering the new
// screen or redirecting to the new path the table names. This test checks the file exists;
// the redirect target is checked by reading the file.
// Left out on purpose: /content and /website/blog (blog agent), /services and /billing/*
// except /billing, /billing/pay*, /billing/charges*, /billing/receipts and /billing/confirm
// (Plan and billing agent).
// Not here on purpose: /content-media/[mediaId] stays on apps/platform (nginx sends it there, the blog media lives on its
// disk); /add-ons/confirm, /advertise, /product-photos and /listing-pictures belonged to dormant or removed flows.
const OLD_PATHS = [
  // Sign in, sign up and account recovery
  "/login",
  "/join",
  "/forgot-password",
  "/reset-password/[token]",
  "/setup/[token]",
  "/restore-account",
  "/restore-account/keep-plan",
  "/restore-account/keep-plan/callback",
  // Pre-payment questions, checkout and billing
  "/personalize",
  "/plan",
  "/onboarding/review",
  "/billing/pay",
  "/billing/pay/callback",
  "/billing/confirm",
  "/billing/charges/[chargeId]/pay",
  "/billing/charges/callback",
  "/billing/charges/confirm",
  "/billing",
  "/billing/receipts",
  "/add-ons",
  // Home and checklist
  "/",
  "/todo",
  "/monitoring",
  "/onboarding",
  "/onboarding/business",
  "/onboarding/brand",
  "/onboarding/content",
  "/onboarding/domain",
  // Requests and support
  "/requests",
  "/requests/new",
  "/requests/calls",
  "/support",
  "/support/[ticketId]",
  "/support-attachments/[attachmentId]",
  // Website, enquiries and domain
  "/website",
  "/project",
  "/website/pages",
  "/website/preview-image",
  "/website/enquiries",
  "/website/enquiries/leads",
  "/website/enquiries/name",
  "/oyechats",
  "/domain",
  // Business, social, search, settings and affiliate
  "/details",
  "/social",
  "/search",
  "/changelog",
  "/settings",
  "/settings/privacy",
  "/settings/privacy/export",
  "/settings/delete",
  "/affiliate",
  "/affiliate/setup/[token]",
  // Media and image routes
  "/media/[mediaId]",
  "/deliverable-images/[deliverableId]",
] as const;

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const ROUTE_FILES = ["page.tsx", "route.ts"] as const;

const isRouteGroup = (name: string): boolean => /^\(.+\)$/.test(name);
const isDynamicSegment = (name: string): boolean => /^\[.+\]$/.test(name);

function subdirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** The given folders plus every route group folder nested under them. Groups add no URL segment. */
function withRouteGroups(dirs: readonly string[]): string[] {
  const found: string[] = [];
  const pending = [...dirs];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    found.push(dir);
    for (const name of subdirectories(dir)) {
      if (isRouteGroup(name)) pending.push(join(dir, name));
    }
  }
  return found;
}

/** Every folder under src/app that can answer urlPath, trying each route group that exists. */
function candidateFolders(urlPath: string): string[] {
  let dirs = withRouteGroups([APP_DIR]);
  for (const segment of urlPath.split("/").filter(Boolean)) {
    const matched = dirs.flatMap((dir) =>
      subdirectories(dir)
        .filter((name) => name === segment || (isDynamicSegment(segment) && isDynamicSegment(name)))
        .map((name) => join(dir, name)),
    );
    dirs = withRouteGroups(matched);
  }
  return dirs;
}

/** The page.tsx or route.ts that answers urlPath, or null when there is none. */
function findRouteFile(urlPath: string): string | null {
  for (const dir of candidateFolders(urlPath)) {
    for (const file of ROUTE_FILES) {
      const candidate = join(dir, file);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

describe("old customer paths still have a route in apps/customer", () => {
  it.each(OLD_PATHS)("%s has a page.tsx or route.ts", (urlPath) => {
    expect(findRouteFile(urlPath), `no page.tsx or route.ts answers ${urlPath}`).not.toBeNull();
  });
});

// Old paths whose page only sends the visitor on. PARITY Part 2: every such redirect is permanent (308), so a bookmark or
// an emailed link is updated, never a temporary 307.
const MOVED_PATHS = [
  "/details",
  "/oyechats",
  "/website/enquiries",
  "/website/enquiries/leads",
  "/website/enquiries/name",
  "/content",
  "/content/blog",
  "/content/blog/new",
  "/content/blog/[postId]",
  "/content/blog/settings",
  "/content/authors",
  "/content/authors/new",
  "/content/authors/[authorId]",
  "/content/categories",
  "/content/categories/new",
  "/content/categories/[categoryId]",
  "/todo",
  "/monitoring",
  "/project",
  "/domain",
  "/requests/new",
  "/requests/calls",
  "/support",
  "/support/[ticketId]",
  "/personalize",
  "/plan",
  "/onboarding/review",
  "/services",
] as const;

describe("old paths that moved redirect permanently", () => {
  it.each(MOVED_PATHS)("%s uses permanentRedirect, never redirect", (urlPath) => {
    const file = findRouteFile(urlPath);
    expect(file, `no route file for ${urlPath}`).not.toBeNull();
    const source = readFileSync(file ?? "", "utf8");
    expect(source).toMatch(/permanentRedirect\(/);
    expect(source).not.toMatch(/(^|[^A-Za-z])redirect\(/m);
  });
});
