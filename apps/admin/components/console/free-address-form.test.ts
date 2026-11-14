import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeFreeAddressForm, FreeAddressForm } from "./free-address-form";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/clients/[businessId]/actions", () => ({
  changeFreeAddressAction: vi.fn(),
  useFreeAddressAction: vi.fn(),
}));

describe("free-address-form", () => {
  it("renders FreeAddressForm with base domain and action", () => {
    const html = renderToStaticMarkup(
      createElement(FreeAddressForm, { businessId: "b1", baseDomain: "sites.brandbasket.in" }),
    );
    expect(html).toContain("Free address");
    expect(html).toContain(".sites.brandbasket.in");
  });

  it("renders ChangeFreeAddressForm with confirm dialog", () => {
    const html = renderToStaticMarkup(
      createElement(ChangeFreeAddressForm, {
        businessId: "b1",
        baseDomain: "sites.brandbasket.in",
        currentName: "my-bakery",
      }),
    );
    expect(html).toContain("Change address");
    expect(html).toContain("Change free website address");
    expect(html).toContain("This changes the address on the free domain.");
    expect(html).toContain('name="confirm"');
    expect(html).toContain('value="yes"');
  });
});
