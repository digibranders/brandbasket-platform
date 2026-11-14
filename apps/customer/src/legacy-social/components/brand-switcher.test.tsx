import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrandsView } from "@/features/social/brands";
import { renameBrandAction, renameFirstBrandAction } from "@/legacy-social/brand-actions";
import { BrandControl, BrandSwitcher } from "./brand-switcher";

vi.mock("@/legacy-social/brand-actions", () => ({
  addBrandAction: vi.fn(async () => ({ status: "saved" })),
  archiveBrandAction: vi.fn(async () => ({ status: "saved" })),
  renameBrandAction: vi.fn(async () => ({ status: "saved" })),
  renameFirstBrandAction: vi.fn(async () => ({ status: "saved" })),
  selectBrandAction: vi.fn(async () => ({ status: "saved" })),
}));

const brand = (externalId: string, name: string) => ({ externalId, name, website: null, archived: false });
const one: BrandsView = { brands: [brand("b1", "Om Sweets")], allowed: 1, used: 1 };
const room: BrandsView = { brands: [brand("b1", "Om Sweets")], allowed: 4, used: 1 };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BrandSwitcher", () => {
  it("shows the only brand's name with a way to rename it, even when no more are allowed", () => {
    render(<BrandSwitcher view={one} current="b1" />);
    expect(screen.getByText("Om Sweets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Brand" })).toBeNull();
  });

  it("offers the choice of brand and the window to add brands when more are allowed", () => {
    render(<BrandSwitcher view={room} current="b1" />);
    expect(screen.getByRole("button", { name: "Add brands" })).toBeTruthy();
  });

  it("renames the brand with the name written", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    render(<BrandSwitcher view={one} current="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.click(screen.getAllByText("Rename", { selector: "button" })[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText("New name"), { target: { value: "Om Cafe" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", hidden: true }));
    await waitFor(() => expect(vi.mocked(renameBrandAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(renameBrandAction).mock.calls[0]?.[0] as FormData;
    expect(form.get("brand")).toBe("b1");
    expect(form.get("name")).toBe("Om Cafe");
  });

  it("shows the business's own name before the posting service has the brand, and saves the name written", async () => {
    render(<BrandControl view={null} current="b1" name="Om Sweets" />);
    expect(screen.getByText("Om Sweets")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Brand name"), { target: { value: "Om Cafe" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(vi.mocked(renameFirstBrandAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(renameFirstBrandAction).mock.calls[0]?.[0] as FormData).get("name")).toBe("Om Cafe");
  });

  it("shows the business's name too when the posting service lists no brand of it yet", () => {
    render(<BrandControl view={{ brands: [], allowed: 1, used: 0 }} current="b1" name="Om Sweets" />);
    expect(screen.getByText("Om Sweets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
  });
});
