import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import { ToastProvider } from "@/ui";
import type { ContactView, SiteFactsView } from "../loader";
import { BusinessDetails } from "./business-details";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  saveContactAction: vi.fn(),
  saveHoursAction: vi.fn(),
  saveAnnouncementAction: vi.fn(),
  clearAnnouncementAction: vi.fn(),
  addClosureAction: vi.fn(),
  deleteClosureAction: vi.fn(),
}));

const NOISE = /No data|undefined|\bnull\b|NaN/;
const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;
const ok = <T,>(data: T): Loaded<T> => ({ ok: true, data });
const customer = { role: "owner", currency: "INR", billing: { hasWebsite: true } } as unknown as CustomerContext;

const CONTACT: ContactView = { displayName: "Apex Diagnostics", phoneCountry: "IN", dialCode: "+91", phone: "98201 55012", email: "hello@apex.in", addressLine1: "Shop 4", addressLine2: "", city: "Mumbai", region: "", postalCode: "400028", country: "India", serviceAreas: "Dadar" };
const NO_HOURS: Record<string, string> = {};
for (let day = 0; day < 7; day += 1) Object.assign(NO_HOURS, { [`hours.${day}.mode`]: "unset", [`hours.${day}.opens`]: "", [`hours.${day}.closes`]: "" });
const EMPTY_SITE: SiteFactsView = { today: "2026-11-03", hours: NO_HOURS, closures: [], announcement: null, defaultStartsOn: "2026-11-03", defaultEndsOn: "2026-11-05" };

const show = (contact: Loaded<ContactView>, siteFacts: Loaded<SiteFactsView> | null) =>
  render(
    <ToastProvider>
      <BusinessDetails customer={customer} contact={contact} siteFacts={siteFacts} />
    </ToastProvider>,
  );

describe("Business details: one failed panel", () => {
  it("failed contact shows its own error and keeps the website panel", () => {
    show(FAILED, ok(EMPTY_SITE));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your business details.");
    expect(screen.getByRole("heading", { name: "Opening hours" })).toBeTruthy();
  });

  it("failed site facts show their own error and keep the contact form", () => {
    show(ok(CONTACT), FAILED);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your opening hours, holidays and announcement.");
    expect(screen.getByLabelText("Business name")).toBeTruthy();
  });
});

describe("Business details: nothing entered yet", () => {
  it("says there are no holidays and draws every section without a crash", () => {
    const { container } = show(ok({ ...CONTACT, addressLine1: "", city: "", postalCode: "", serviceAreas: "", phone: "" }), ok(EMPTY_SITE));
    expect(screen.getByText("No holidays coming up")).toBeTruthy();
    expect(screen.getByText("The holidays you add appear here until they have passed.")).toBeTruthy();
    for (const title of ["About your business", "Address and areas", "Opening hours", "Holidays", "Announcement banner"]) expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
