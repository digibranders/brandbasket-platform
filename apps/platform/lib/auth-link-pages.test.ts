import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import SetupPage from "@/app/app-host/setup/[token]/page";
import AffiliateSetupPage from "@/app/app-host/affiliate/setup/[token]/page";
import { findInviteForToken } from "@/lib/server/setup";
import { findAffiliateInviteForToken } from "@/lib/server/affiliate-setup";

vi.mock("@/lib/server/request-brand", async () => {
  const { LISTING_BRAND } = await import("@/lib/testing/listing-brand");
  return { requestBrand: async () => LISTING_BRAND, currentBrand: async () => LISTING_BRAND };
});
vi.mock("@brandbasket/shared/ui/turnstile-scope", () => ({ TurnstileScope: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/server/setup", () => ({ findInviteForToken: vi.fn() }));
vi.mock("@/lib/server/affiliate-setup", () => ({ findAffiliateInviteForToken: vi.fn() }));
vi.mock("@/app/app-host/setup/[token]/actions", () => ({ completeSetup: vi.fn() }));
vi.mock("@/app/app-host/affiliate/setup/[token]/actions", () => ({ completeAffiliateSetup: vi.fn() }));
vi.mock("@/components/panel/setup-form", () => ({ SetupForm: () => createElement("form") }));
vi.mock("@/components/panel/entry-screen", () => ({
  EntryScreen: ({ title, lede, children }: { title: ReactNode; lede: string; children: ReactNode }) =>
    createElement("main", null, title, createElement("p", null, lede), children),
}));

beforeEach(() => vi.clearAllMocks());

it.each([false, true])("keeps the same setup token retryable when lookup is limited (affiliate=%s)", async (affiliate) => {
  vi.mocked(findInviteForToken).mockResolvedValue({ kind: "limited", retryAfterSeconds: 137 });
  vi.mocked(findAffiliateInviteForToken).mockResolvedValue({ kind: "limited", retryAfterSeconds: 137 });
  const page = affiliate ? AffiliateSetupPage : SetupPage;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ token: "same-token" }) }));
  expect(html).toContain("3 minutes");
  expect(html).toContain(`href="${affiliate ? "/affiliate" : ""}/setup/same-token"`);
  expect(html).not.toContain("no longer");
  expect(html).not.toContain("<form");
});
