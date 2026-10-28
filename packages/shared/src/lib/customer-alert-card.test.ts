import { describe, expect, it } from "vitest";
import { customerEventTeamsCard } from "./customer-alert-card";

const BASE = {
  customer: { name: "Asha Rao", email: "asha@example.com", phone: "+91 98200 11111" },
  business: { name: "Rao Clinic", websiteUrl: null },
  consoleUrl: "https://console.example/clients/biz-1",
} as const;

describe("customerEventTeamsCard", () => {
  it("titles each event, lists who the customer is and links to the client", () => {
    const sign = JSON.stringify(customerEventTeamsCard({ ...BASE, event: "setup_sent", facts: [{ name: "First preview due in", value: "48 hours" }] }));
    for (const part of ["Website details received: Rao Clinic", "Asha Rao", "asha@example.com", "48 hours", "Open the client", BASE.consoleUrl]) expect(sign).toContain(part);
    expect(JSON.stringify(customerEventTeamsCard({ ...BASE, event: "account_closed" }))).toContain("Account closed: Rao Clinic");
  });

  it("titles a website taken offline and lists the facts it was given", () => {
    const card = JSON.stringify(customerEventTeamsCard({ ...BASE, event: "website_paused", facts: [{ name: "Why", value: "The paid month ended" }] }));
    for (const part of ["Website taken offline: Rao Clinic", "The paid month ended", "Open the client"]) expect(card).toContain(part);
  });

  it("carries the customer's own words and leaves empty facts out", () => {
    const card = JSON.stringify(customerEventTeamsCard({ ...BASE, event: "account_closed", facts: [{ name: "Reason", value: "Too expensive" }, { name: "Plan paid until", value: null }], text: "Prices went up." }));
    expect(card).toContain("Prices went up.");
    expect(card).toContain("Too expensive");
    expect(card).not.toContain("Plan paid until");
    expect(card).not.toContain("Website");
  });

  it("titles a booked kickoff and puts the meeting link after the button that opens the client", () => {
    const card = customerEventTeamsCard({ ...BASE, event: "kickoff_booked", buttons: [{ label: "Join the call", url: "https://app.cal.com/video/abc" }] });
    expect(JSON.stringify(card)).toContain("Kickoff call booked: Rao Clinic");
    const actions = (card.attachments[0].content.actions ?? []) as { title: string; url: string }[];
    expect(actions.map((action) => action.title)).toEqual(["Open the client", "Join the call"]);
    expect(actions[1]?.url).toBe("https://app.cal.com/video/abc");
  });
});
