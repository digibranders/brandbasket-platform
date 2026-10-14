import { describe, expect, it, vi } from "vitest";
import { matchesClientSearch } from "./client-search";

vi.mock("server-only", () => ({}));

const client = {
  businessName: "Sunrise Bakery",
  owner: { name: "Priya Nair", email: "priya@sunrise.example", phone: "+919876543210" },
} as const;

describe("matchesClientSearch", () => {
  it("matches everyone when nothing was typed", () => {
    expect(matchesClientSearch(client, "")).toBe(true);
  });

  it.each(["sunrise", "priya", "nair", "priya@sunrise", "+919876543210"])("finds the client by %s", (term) => {
    expect(matchesClientSearch(client, term)).toBe(true);
  });

  it("finds the client by the phone number as it is written on screen", () => {
    expect(matchesClientSearch(client, "98765 43210")).toBe(true);
  });

  it("does not match something else", () => {
    expect(matchesClientSearch(client, "dental")).toBe(false);
  });

  it("copes with a client that has no owner", () => {
    expect(matchesClientSearch({ businessName: "Orphan Cafe", owner: null }, "orphan")).toBe(true);
    expect(matchesClientSearch({ businessName: "Orphan Cafe", owner: null }, "priya")).toBe(false);
  });
});
