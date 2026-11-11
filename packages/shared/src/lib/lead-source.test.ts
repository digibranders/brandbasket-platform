import { leadSource } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { LEAD_SOURCE_LABELS, LEAD_SOURCE_ORDER, websitePlanLabels } from "./lead-source";

describe("lead sources", () => {
  it("lists every source the database knows, in the order the filters show them", () => {
    expect([...LEAD_SOURCE_ORDER].sort()).toEqual([...leadSource.enumValues].sort());
    expect(LEAD_SOURCE_ORDER.map((source) => LEAD_SOURCE_LABELS[source])).toEqual(["Website form", "Pricing page", "Sign-up", "Added after a call"]);
  });
});

describe("websitePlanLabels", () => {
  it("names the website's plan ids, and keeps an unknown id as it is", () => {
    expect(websitePlanLabels(["website", "growth", "search"])).toEqual(["Website", "Social & Ads", "Search"]);
    expect(websitePlanLabels(["care"])).toEqual(["care"]);
  });
});
