import { describe, expect, it, vi } from "vitest";
import { matchesLeadSearch } from "./lead-search";

vi.mock("server-only", () => ({}));

const lead = { businessName: "Green Leaf Cafe", name: "Neha Joshi", email: "neha@greenleaf.example", phone: "+919876543210" };

describe("matchesLeadSearch", () => {
  it("finds a lead by business, name or email", () => {
    expect(matchesLeadSearch(lead, "green leaf")).toBe(true);
    expect(matchesLeadSearch(lead, "neha")).toBe(true);
    expect(matchesLeadSearch(lead, "greenleaf.example")).toBe(true);
  });

  it("finds a phone number written as it is stored or as it is shown", () => {
    expect(matchesLeadSearch(lead, "+919876543210")).toBe(true);
    expect(matchesLeadSearch(lead, "98765 43210")).toBe(true);
  });

  it("matches nothing else", () => {
    expect(matchesLeadSearch(lead, "bakery")).toBe(false);
    expect(matchesLeadSearch({ ...lead, phone: null }, "98765")).toBe(false);
  });
});
