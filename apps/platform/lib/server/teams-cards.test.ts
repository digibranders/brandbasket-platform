import { describe, expect, it } from "vitest";
import {
  chatbotLeadTeamsCard,
  leadTeamsCard,
  supportReplyTeamsCard,
  supportTicketTeamsCard,
  systemErrorTeamsCard,
} from "./teams-cards";

type Block = { type: string; text?: string; facts?: { title: string; value: string }[] };
const parts = (message: ReturnType<typeof leadTeamsCard>): { body: Block[]; actions?: { title: string; url: string }[] } =>
  message.attachments[0].content as { body: Block[]; actions?: { title: string; url: string }[] };

describe("the Teams cards carry what the alert emails carry", () => {
  it("shows an enquiry's person, business, contact details, message and a link to the lead", () => {
    const card = parts(leadTeamsCard({ name: "Asha Rao", businessName: "Rao Clinic", businessType: "Clinic", email: "asha@example.com", phone: "+91 98200 11111", message: "Please call me this week.", leadUrl: "https://console.example/leads/7" }));
    expect(card.body[0]?.text).toBe("New enquiry: Rao Clinic");
    expect(card.body[1]?.text).toBe("Asha Rao got in touch");
    expect(card.body[2]?.facts).toEqual([
      { title: "Business type", value: "Clinic" },
      { title: "Email", value: "asha@example.com" },
      { title: "Phone", value: "+91 98200 11111" },
    ]);
    expect(card.body[3]?.text).toBe("Please call me this week.");
    expect(card.actions).toEqual([{ type: "Action.OpenUrl", title: "Open the lead", url: "https://console.example/leads/7" }]);
  });

  it("leaves out a phone number and a message that were not given", () => {
    const card = parts(leadTeamsCard({ name: "A", businessName: "B", businessType: "Cafe", email: "a@example.com", phone: null, message: null, leadUrl: "https://console.example/leads/8" }));
    expect(card.body.map((block) => block.type)).toEqual(["TextBlock", "TextBlock", "FactSet"]);
    expect(card.body[2]?.facts?.map((fact) => fact.title)).toEqual(["Business type", "Email"]);
  });

  it("shows what a website visitor picked and their city, after the business type", () => {
    const card = parts(leadTeamsCard({ name: "Neha", businessName: "Green Leaf Cafe", businessType: "Not given", wants: "Website, Social & Ads", city: "Pune", email: "neha@example.com", phone: null, message: null, leadUrl: "https://console.example/leads/9" }));
    expect(card.body[2]?.facts?.map((fact) => fact.title)).toEqual(["Business type", "Wants", "City", "Email"]);
    expect(card.body[2]?.facts?.[1]?.value).toBe("Website, Social & Ads");
  });

  it("names a bug report by its kind and subject, with the reporter, the details and the browser", () => {
    const card = parts(
      supportTicketTeamsCard({
        reference: "FY-0192ABCD",
        categoryLabel: "Report a bug",
        subject: "Cannot upload photos",
        description: "The upload button spins forever.",
        statusLabel: "New",
        requesterName: "Asha Rao",
        requesterEmail: "asha@example.com",
        requesterPhone: "+91 98200 11111",
        businessName: "Rao Clinic",
        details: { Page: "/photos" },
        attachmentCount: 2,
        browserDevice: "Chrome on Android",
        adminUrl: "https://console.example/support/1",
      }),
    );
    expect(card.body[0]?.text).toBe("Report a bug: Cannot upload photos");
    expect(card.body[1]?.text).toBe("FY-0192ABCD");
    expect(card.body[2]?.facts?.map((fact) => fact.title)).toEqual(["From", "Email", "Phone", "Business", "Status", "Page", "Attachments", "Browser and device"]);
    expect(card.body[3]?.text).toBe("The upload button spins forever.");
    expect(card.actions?.[0]?.url).toBe("https://console.example/support/1");
  });

  it("shows a customer's reply with its request and the reply text", () => {
    const card = parts(supportReplyTeamsCard({ reference: "FY-1", subject: "Photos", categoryLabel: "Report a bug", statusLabel: "In progress", authorName: "Asha Rao", authorEmail: "asha@example.com", body: "Still failing.", attachmentCount: 0, adminUrl: "https://console.example/support/1" }));
    expect(card.body[0]?.text).toBe("Reply on FY-1: Photos");
    expect(card.body[1]?.text).toBe("Asha Rao replied");
    expect(card.body[3]?.text).toBe("Still failing.");
  });

  it("describes a system error with where it happened and a link to the error reports", () => {
    const card = parts(systemErrorTeamsCard({ app: "platform", operation: "billing.confirm", errorClass: "TypeError", route: "/billing", severity: "error", release: "abc123", adminUrl: "https://console.example/support/errors" }));
    expect(card.body[0]?.text).toBe("System error: TypeError");
    expect(card.body[1]?.text).toBe("platform, error");
    expect(card.body[2]?.facts).toEqual([
      { title: "Operation", value: "billing.confirm" },
      { title: "Route", value: "/billing" },
      { title: "Release", value: "abc123" },
    ]);
    expect(card.actions?.[0]?.title).toBe("Open the error reports");
  });

  it("tells the team about a chatbot lead without any of the visitor's details", () => {
    const card = parts(chatbotLeadTeamsCard({ clientUrl: "https://console.example/clients/5" }));
    expect(card.body.map((block) => block.text)).toEqual(["New chatbot lead", "A visitor left their details with a client's chatbot"]);
    expect(card.actions).toEqual([{ type: "Action.OpenUrl", title: "Open the client", url: "https://console.example/clients/5" }]);
  });
});
