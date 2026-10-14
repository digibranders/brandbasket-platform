import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import SetupPage from "@/app/app-host/setup/[token]/page";
import AffiliateSetupPage from "@/app/app-host/affiliate/setup/[token]/page";
import ConfirmEmailPage from "@/app/app-host/confirm-email/[token]/page";
import { findInviteForToken } from "@/lib/server/setup";
import { findAffiliateInviteForToken } from "@/lib/server/affiliate-setup";
import { confirmEmail } from "@/lib/server/account-recovery";

vi.mock("@/lib/server/request-brand", async () => {
  const { BRANDS } = await import("@/lib/brand");
  return { requestBrand: async () => BRANDS.firstfold, currentBrand: async () => BRANDS.firstfold };
});
vi.mock("@firstfold/shared/ui/turnstile-scope", () => ({ TurnstileScope: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/server/setup", () => ({ findInviteForToken: vi.fn() }));
vi.mock("@/lib/server/affiliate-setup", () => ({ findAffiliateInviteForToken: vi.fn() }));
vi.mock("@/lib/server/account-recovery", () => ({ confirmEmail: vi.fn() }));
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

it.each(["limited", "failed"] as const)("email confirmation %s retains the same-token retry path", async (kind) => {
  vi.mocked(confirmEmail).mockResolvedValue(kind === "limited" ? { kind, retryAfterSeconds: 137 } : { kind });
  const html = renderToStaticMarkup(await ConfirmEmailPage({ params: Promise.resolve({ token: "signed.token" }) }));
  expect(html).toContain('href="/confirm-email/signed.token"');
  expect(html).not.toContain("no longer");
  expect(html).not.toContain("Your email is");
  if (kind === "limited") expect(html).toContain("3 minutes");
});
