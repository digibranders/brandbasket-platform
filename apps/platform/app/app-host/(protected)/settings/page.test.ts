import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findReactivationNetCents } from "@/lib/server/billing";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import SettingsPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn(), getCustomerBusinessKind: vi.fn() }));
vi.mock("@/lib/server/billing", () => ({ findReactivationNetCents: vi.fn() }));
vi.mock("@/lib/server/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/server/account-label", () => ({ accountLabel: (user: { email: string }) => user.email }));
vi.mock("@/components/panel/email-us", () => ({ EmailUs: () => "support@brandbasket.in" }));
vi.mock("@/components/panel/change-password-form", () => ({ ChangePasswordForm: () => "[password form]" }));
vi.mock("@brandbasket/shared/lib/billing/terms", () => ({ describePlanTerms: () => "₹2,999 a month, GST included." }));
vi.mock("./actions", () => ({ changePasswordAction: vi.fn(), revokeOtherSessionsAction: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Plan35 Dental" };
const user = { id: "user-1", name: "Priya Test", email: "priya@example.test", phone: null };
const plan = { currency: "INR", name: "Brandbasket services plan", recurringAmountCents: 299900, taxRateBasisPoints: 1800, intervalMonths: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user, tenant, billing: { status: "paid", plan, subscription: null } } as never);
  vi.mocked(getCustomerBusinessKind).mockResolvedValue("website");
  vi.mocked(findReactivationNetCents).mockResolvedValue(null);
});

async function render(): Promise<string> {
  return renderToStaticMarkup(await SettingsPage()).replaceAll("<!-- -->", "");
}

describe("the Settings page", () => {
  it("is sections on the page, not boxes, with one dark button's form in it", async () => {
    const html = await render();
    for (const title of ["Your account", "Your business", "Password", "Your privacy", "Delete account", "Session"]) expect(html).toContain(`>${title}</h2>`);
    expect(html).toContain("[password form]");
    expect(html).not.toContain("shadow");
    expect(html).not.toContain("rounded-card");
    expect(html).not.toContain("border border-line");
  });

  it("is one form-width column in the page frame", async () => {
    const html = await render();
    expect(html).toContain("@container");
    expect(html).toContain("max-w-[40rem]");
    expect(html).not.toContain("mx-auto");
  });

  it("states the account and the business as rows", async () => {
    const html = await render();
    expect(html).toContain(">Priya Test</dd>");
    expect(html).toContain(">priya@example.test</dd>");
    expect(html).toContain(">Plan35 Dental</dd>");
    expect(html).toContain("Billed in");
    expect(html).toContain("₹2,999 a month, GST included.");
  });

  it("says mobile number for an account opened with a phone, and what to email to change it", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { ...user, phone: "+919820011223" }, tenant, billing: { status: "paid", plan, subscription: null } } as never);
    const html = await render();
    expect(html).toContain(">Mobile number</dt>");
    expect(html).toContain("To change the mobile number you sign in with, email us at support@brandbasket.in.");
  });

  it("sends the person to the privacy and delete pages with soft buttons, and offers Sign out", async () => {
    const html = await render();
    expect(html).toContain('href="/settings/privacy"');
    expect(html).toContain('href="/settings/delete"');
    expect(html).toContain(">Sign out</button>");
    expect(html).not.toMatch(/border-line bg-card/);
  });

  it("names a free listing account's business and kind instead of a plan", async () => {
    vi.mocked(getCustomerBusinessKind).mockResolvedValue("listing");
    const html = await render();
    expect(html).toContain("Free listing on the local directory");
    expect(html).not.toContain("Billed in");
  });
});
