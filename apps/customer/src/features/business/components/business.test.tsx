import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Loaded } from "@/lib/loaded";
import { ToastProvider } from "@/ui";
import { saveContactAction } from "../actions";
import type { ContactView, SiteFactsView } from "../loader";
import { BusinessDetails } from "./business-details";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  saveContactAction: vi.fn(async () => ({ ok: true })),
  saveHoursAction: vi.fn(async () => ({ ok: true })),
  saveAnnouncementAction: vi.fn(async () => ({ ok: true })),
  clearAnnouncementAction: vi.fn(async () => ({ ok: true })),
  addClosureAction: vi.fn(async () => ({ ok: true })),
  deleteClosureAction: vi.fn(async () => ({ ok: true })),
}));

const CONTACT: ContactView = {
  displayName: "Apex Diagnostics",
  phoneCountry: "IN",
  dialCode: "+91",
  phone: "98201 55012",
  email: "hello@apexdiagnostics.in",
  addressLine1: "Shop 4",
  addressLine2: "",
  city: "Mumbai",
  region: "",
  postalCode: "400028",
  country: "India",
  serviceAreas: "Dadar",
};

const HOURS: Record<string, string> = {};
for (let day = 0; day < 7; day += 1) {
  HOURS[`hours.${day}.mode`] = day === 0 ? "open" : "unset";
  HOURS[`hours.${day}.opens`] = day === 0 ? "07:00" : "";
  HOURS[`hours.${day}.closes`] = day === 0 ? "20:00" : "";
}

const SITE: SiteFactsView = {
  today: "2026-11-03",
  hours: HOURS,
  closures: [{ id: "c1", startsOn: "2026-11-08", endsOn: "2026-11-10", note: "Diwali", opensAt: null, closesAt: null }],
  announcement: { message: "Open on Diwali", startsOn: "2026-11-03", endsOn: "2026-11-09" },
  defaultStartsOn: "2026-11-03",
  defaultEndsOn: "2026-11-05",
};

const ok = <T,>(data: T): Loaded<T> => ({ ok: true, data });
const failed = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;

function customer(role: "owner" | "viewer", hasWebsite = true) {
  return { role, currency: "INR", billing: { hasWebsite } } as never;
}

function renderDetails(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("BusinessDetails", () => {
  it("shows each panel's error state when its read failed, and never an empty form", () => {
    renderDetails(<BusinessDetails customer={customer("owner")} contact={failed} siteFacts={failed} />);
    expect(screen.getByText(/We could not load your business details/)).toBeTruthy();
    expect(screen.getByText(/We could not load your opening hours, holidays and announcement/)).toBeTruthy();
    expect(screen.queryByLabelText("Business name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a holiday" })).toBeNull();
  });

  it("keeps the other panel when only one read failed", () => {
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={failed} />);
    expect(screen.getByLabelText("Business name")).toBeTruthy();
    expect(screen.getByText(/We could not load your opening hours/)).toBeTruthy();
  });

  it("shows only the contact details to a business without the Managed Website", () => {
    renderDetails(<BusinessDetails customer={customer("owner", false)} contact={ok(CONTACT)} siteFacts={null} />);
    expect(screen.getByLabelText("Business name")).toBeTruthy();
    expect(screen.queryByText("Opening hours")).toBeNull();
    expect(screen.queryByText("Announcement banner")).toBeNull();
  });

  it("shows every section with where it appears, for the Managed Website", () => {
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={ok(SITE)} />);
    for (const title of ["About your business", "Address and areas", "Opening hours", "Holidays", "Announcement banner"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getByText("Updates your website in about a minute")).toBeTruthy();
    expect(screen.getByText("Showing until Mon 9 Nov")).toBeTruthy();
    expect(screen.getByText("Diwali")).toBeTruthy();
  });

  it("labels the postal code for the customer's currency", () => {
    const { unmount } = renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={null} />);
    expect(screen.getByLabelText("PIN code")).toBeTruthy();
    unmount();
    renderDetails(<BusinessDetails customer={{ role: "owner", currency: "USD", billing: { hasWebsite: false } } as never} contact={ok(CONTACT)} siteFacts={null} />);
    expect(screen.getByLabelText("Postal code")).toBeTruthy();
  });

  it("lets a viewer read but not change anything", () => {
    renderDetails(<BusinessDetails customer={customer("viewer")} contact={ok(CONTACT)} siteFacts={ok(SITE)} />);
    expect((screen.getByLabelText("Business name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Message") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Add a holiday" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("offers Add a holiday and a Remove on each holiday to an owner", () => {
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={ok(SITE)} />);
    expect(screen.getByRole("button", { name: "Add a holiday" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove holiday/ })).toBeTruthy();
  });

  it("shows the save bar only after an edit, saves that form, and Discard puts the saved values back", async () => {
    const user = userEvent.setup();
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={ok(SITE)} />);
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();

    const name = screen.getByLabelText("Business name") as HTMLInputElement;
    await user.type(name, " Labs");
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(name.value).toBe("Apex Diagnostics Labs");

    await user.click(within(bar).getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Apex Diagnostics");

    await user.type(screen.getByLabelText("Business name"), "!");
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Save changes" }));
    const sent = vi.mocked(saveContactAction).mock.calls[0]?.[0];
    expect(sent?.get("displayName")).toBe("Apex Diagnostics!");
    expect(sent?.get("phoneCountry")).toBe("IN");
    expect(sent?.get("phone")).toBe("98201 55012");
  });

  it("hands the save bar to the form edited last", async () => {
    const user = userEvent.setup();
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={ok(SITE)} />);
    await user.type(screen.getByLabelText("Business name"), "x");
    await user.type(screen.getByLabelText("Message"), "!");
    const bars = screen.getAllByRole("region", { name: "Unsaved changes" });
    expect(bars).toHaveLength(1);
    expect(within(bars[0] as HTMLElement).getByRole("button", { name: "Save changes" }).getAttribute("form")).toBe("business-announcement");
  });

  it("shows a refused save's message above the form and the field's own message under it", async () => {
    vi.mocked(saveContactAction).mockResolvedValueOnce({ ok: false, message: "Check the fields marked below.", fieldErrors: { email: "Enter a valid email address." } });
    const user = userEvent.setup();
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={null} />);
    await user.type(screen.getByLabelText("Email"), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Check the fields marked below.")).toBeTruthy();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("hello@apexdiagnostics.inx");
  });

  it("keeps the form and what was typed when the save never gets an answer", async () => {
    vi.mocked(saveContactAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderDetails(<BusinessDetails customer={customer("owner")} contact={ok(CONTACT)} siteFacts={null} />);
    await user.type(screen.getByLabelText("Business name"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("We could not save that. Try again.")).toBeTruthy();
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Apex Diagnostics!");
  });
});
