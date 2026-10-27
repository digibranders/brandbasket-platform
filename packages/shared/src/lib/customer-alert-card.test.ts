import { describe, expect, it } from "vitest";
import { customerEventTeamsCard } from "./customer-alert-card";

const BASE = {
  customer: { name: "Asha Rao", email: "asha@example.com", phone: "+91 98200 11111" },
  business: { name: "Rao Clinic", websiteUrl: null },
  consoleUrl: "https://console.example/clients/biz-1",
} as const;

describe("customerEventTeamsCard", () => {
  it("titles each event, lists who the customer is and links to the client", () => {
    const sign = JSON.stringify(customerEventTeamsCard({ ...BASE, event: "signed_up", facts: [{ name: "Plan chosen", value: "Managed Website" }] }));
    for (const part of ["New sign-up: Rao Clinic", "Asha Rao", "asha@example.com", "Managed Website", "Open the client", BASE.consoleUrl]) expect(sign).toContain(part);
    expect(JSON.stringify(customerEventTeamsCard({ ...BASE, event: "setup_sent" }))).toContain("Website details received: Rao Clinic");
    expect(JSON.stringify(customerEventTeamsCard({ ...BASE, event: "account_closed" }))).toContain("Account closed: Rao Clinic");
  });

  it("carries the customer's own words and leaves empty facts out", () => {
    const card = JSON.stringify(customerEventTeamsCard({ ...BASE, event: "account_closed", facts: [{ name: "Reason", value: "Too expensive" }, { name: "Plan paid until", value: null }], text: "Prices went up." }));
    expect(card).toContain("Prices went up.");
    expect(card).toContain("Too expensive");
    expect(card).not.toContain("Plan paid until");
    expect(card).not.toContain("Website");
  });
});
