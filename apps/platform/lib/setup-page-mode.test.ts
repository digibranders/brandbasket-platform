import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import SetupPage from "@/app/app-host/setup/[token]/page";
import AffiliateSetupPage from "@/app/app-host/affiliate/setup/[token]/page";
import { findInviteForToken } from "@/lib/server/setup";
import { findAffiliateInviteForToken } from "@/lib/server/affiliate-setup";

vi.mock("@/lib/server/request-brand", async () => {
  const { BRANDS } = await import("@/lib/brand");
  return { requestBrand: async () => BRANDS.firstfold, currentBrand: async () => BRANDS.firstfold };
});
vi.mock("@firstfold/shared/ui/turnstile-scope", () => ({ TurnstileScope: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/server/setup", () => ({ findInviteForToken: vi.fn() }));
vi.mock("@/lib/server/affiliate-setup", () => ({ findAffiliateInviteForToken: vi.fn() }));
vi.mock("@/app/app-host/setup/[token]/actions", () => ({ completeSetup: vi.fn() }));
vi.mock("@/app/app-host/affiliate/setup/[token]/actions", () => ({ completeAffiliateSetup: vi.fn() }));
vi.mock("@/components/panel/setup-form", () => ({ SetupForm: () => createElement("form") }));
vi.mock("@/components/panel/entry-screen", () => ({
  EntryScreen: ({ lede, children }: { lede: string; children: ReactNode }) => createElement("main", null, lede, children),
}));

const shared = { id: "invite", email: "owner@example.com", tokenHash: "hash", expiresAt: new Date("2099-01-01") };

it("keeps customer setup copy accurate for creating and linking an existing account", async () => {
  vi.mocked(findInviteForToken).mockResolvedValue({ ...shared, leadId: "lead", businessName: "Owner’s business" });
  const html = renderToStaticMarkup(await SetupPage({ params: Promise.resolve({ token: "invite" }) }));
  expect(html).toContain("Finish setting up");
  expect(html).toContain(shared.email);
  expect(html).not.toContain("Set a password");
});

it.each([null, "existing-user"])("uses neutral affiliate linking copy and explicit reset copy (user=%s)", async (userId) => {
  vi.mocked(findAffiliateInviteForToken).mockResolvedValue({ affiliateId: "affiliate", email: shared.email, name: "Owner", userId });
  const html = renderToStaticMarkup(await AffiliateSetupPage({ params: Promise.resolve({ token: "invite" }) }));
  expect(html).toContain(userId === null ? "Finish linking" : "Set a new password");
  expect(html).not.toContain("Set a password");
});
