import type { BillingDetailsStart } from "@fynix/shared/lib/billing/billing-details-start";
import type { PhoneCountryOption } from "@fynix/shared/lib/phone/fields";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffBillingDetailsState } from "@/lib/billing-details-form-state";
import { BillingDetailsForm } from "./billing-details-form";

const form = vi.hoisted(() => ({ state: { status: "idle" } as unknown, pending: false }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [form.state, () => undefined, form.pending],
}));
// The submit button reads the running action from useFormStatus, which a static render cannot start.
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: form.pending, data: null, method: null, action: null }),
}));

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";
const start: BillingDetailsStart = {
  legalName: "Riverside Dental LLP",
  gstin: "27AAPFU0939F1ZV",
  addressLine1: "12 MG Road",
  addressLine2: "",
  city: "Mumbai",
  postalCode: "400080",
  stateCode: "mh",
  email: "",
  phoneCountry: "IN",
  phone: "",
};
const countries: readonly PhoneCountryOption[] = [{ code: "IN", name: "India", dialCode: "+91", flag: "IN", example: "081234 56789", digits: { min: 8, max: 13 } }];

function render(): string {
  return renderToStaticMarkup(
    createElement(BillingDetailsForm, { businessId: BUSINESS, start, phoneCountries: countries, action: async () => ({ status: "idle" }) as StaffBillingDetailsState }),
  );
}

beforeEach(() => {
  form.state = { status: "idle" };
  form.pending = false;
});

describe("BillingDetailsForm", () => {
  it("starts with the saved values, posts the business, and labels every field", () => {
    const html = render();
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html).toContain('value="Riverside Dental LLP"');
    expect(html).toContain('value="27AAPFU0939F1ZV"');
    for (const id of ["legalName", "gstin", "addressLine1", "addressLine2", "city", "postalCode", "stateCode", "email", "phone"]) {
      expect(html, id).toContain(`for="billing-${id}"`);
      expect(html, id).toContain(`id="billing-${id}"`);
    }
    expect(html).toContain("Save billing details");
    expect(html).not.toContain("role=\"alert\"");
    expect(html).not.toContain("aria-invalid");
  });

  it("marks what the server requires, and declares the shape of the GSTIN and the pincode", () => {
    const html = render();
    for (const id of ["legalName", "addressLine1", "city", "postalCode", "stateCode"]) {
      expect(html.match(new RegExp(`<label for="billing-${id}"[^>]*>.*?</label>`))?.[0], id).toContain("*");
    }
    for (const id of ["gstin", "addressLine2", "email", "phone"]) {
      expect(html.match(new RegExp(`<label for="billing-${id}"[^>]*>.*?</label>`))?.[0], id).not.toContain(">*<");
    }
    expect(html.match(/<input[^>]*id="billing-gstin"[^>]*>/)?.[0]).toContain('maxLength="15"');
    expect(html.match(/<input[^>]*id="billing-gstin"[^>]*>/)?.[0]).toContain("pattern=");
    expect(html.match(/<input[^>]*id="billing-postalCode"[^>]*>/)?.[0]).toContain('pattern="[1-9][0-9]{5}"');
    // The state is a custom dropdown whose chosen value travels in a hidden input.
    expect(html).toMatch(/<input[^>]*required=""[^>]*name="stateCode" value="mh"/);
  });

  it("keeps the saved word in a status region that exists from the start, empty until a save", () => {
    expect(render()).toMatch(/<p role="status"[^>]*><\/p>/);
    form.state = { status: "saved" };
    expect(render()).toMatch(/<p role="status"[^>]*>Saved\.<\/p>/);
  });

  it("shows one refusal under its field as an alert the field points to, and keeps what was typed", () => {
    form.state = {
      status: "error",
      field: "gstin",
      message: "That GSTIN is not valid.",
      values: { ...start, legalName: "Typed Name LLP", gstin: "27AAPFU0939F1ZX" },
    } satisfies StaffBillingDetailsState;
    const html = render();

    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toContain('id="billing-gstin-error" role="alert"');
    expect(html).toContain("That GSTIN is not valid.");
    const gstin = html.match(/<input[^>]*id="billing-gstin"[^>]*>/)?.[0] ?? "";
    expect(gstin).toContain('aria-invalid="true"');
    expect(gstin).toContain('aria-describedby="billing-gstin-error"');
    expect(html.match(/aria-invalid/g)).toHaveLength(1);
    expect(html).toContain('value="Typed Name LLP"');
    expect(html).toContain('value="27AAPFU0939F1ZX"');
  });

  it("points the state select at its refusal too", () => {
    form.state = { status: "error", field: "stateCode", message: "Choose the state.", values: { ...start, stateCode: "" } } satisfies StaffBillingDetailsState;
    const dropdown = render().match(/<button[^>]*id="billing-stateCode"[^>]*>/)?.[0] ?? "";
    expect(dropdown).toContain('role="combobox"');
    expect(dropdown).toContain('aria-invalid="true"');
    expect(dropdown).toContain('aria-describedby="billing-stateCode-error"');
  });

  it("disables the button and marks it busy while saving, and says Saving", () => {
    form.pending = true;
    const html = render();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-busy="true"/);
    expect(html).toContain("Saving…");
  });
});
