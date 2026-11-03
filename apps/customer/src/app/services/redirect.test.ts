import { describe, expect, it, vi } from "vitest";
import AddOnsRedirect from "../add-ons/page";
import ServicesRedirect from "./page";

vi.mock("next/navigation", () => ({
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

describe("old Services and Add-ons addresses", () => {
  it("go to Plan & billing, keeping ?charge= (a paid add-on's return) and any other query", async () => {
    await expect(ServicesRedirect({ searchParams: Promise.resolve({ charge: "processing" }) })).rejects.toThrow("redirect:/billing?charge=processing");
    await expect(AddOnsRedirect({ searchParams: Promise.resolve({ charge: "paid", add: "social" }) })).rejects.toThrow("redirect:/billing?charge=paid&add=social");
    await expect(ServicesRedirect({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/billing");
  });
});
