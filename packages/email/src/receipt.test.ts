import { describe, expect, it } from "vitest";
import { emailLogoUrl } from "./brand";
import { receiptButton, receiptCode, receiptDocument, receiptParagraph, receiptQuote, receiptRows } from "./receipt";
import { changeRequestUpdateEmail, type ChangeRequestUpdate } from "./templates/change-request-update";
import { confirmEmailEmail } from "./templates/confirm-email";
import { domainMovedEmail } from "./templates/domain-moved";
import { domainReadyEmail } from "./templates/domain-ready";
import { passwordResetEmail } from "./templates/password-reset";
import { paymentReceivedEmail } from "./templates/payment-received";
import { previewReadyEmail } from "./templates/preview-ready";
import { privacyRequestCodeEmail } from "./templates/privacy-request-code";
import { setupLinkEmail } from "./templates/setup-link";
import { signupCodeEmail } from "./templates/signup-code";
import { websiteLiveEmail } from "./templates/website-live";
import { bookingCodeEmail } from "./templates/booking-code";
import { domainConnectedEmail } from "./templates/domain-connected";
import { domainRequestedEmail } from "./templates/domain-requested";
import { leadReceivedEmail } from "./templates/lead-received";
import { listingEnquiryEmail } from "./templates/listing-enquiry";
import { onboardingSentEmail } from "./templates/onboarding-sent";
import { previewApprovedEmail } from "./templates/preview-approved";
import { previewRevisionsRequestedEmail } from "./templates/preview-revisions-requested";
import { privacyRequestAlertEmail, privacyRequestsDueEmail } from "./templates/privacy-request-alert";
import { securityEventAlertEmail, staffAccessReviewEmail } from "./templates/security-alert";
import { supportReplyAlertEmail } from "./templates/support-reply-alert";
import { supportTicketAlertEmail } from "./templates/support-ticket-alert";
import { systemErrorAlertEmail } from "./templates/system-error-alert";

const to = "owner@example.com";
const url = "https://app.brandbasket.in/x?token=abc&b=1";

describe("receipt layout helpers", () => {
  it("escapes every value a caller passes in", () => {
    const hostile = `<img src=x onerror="alert(1)">`;
    const html = [
      receiptParagraph(hostile),
      receiptCode(hostile),
      receiptQuote(hostile),
      receiptRows([{ label: hostile, value: hostile }]),
      receiptButton(url, hostile),
      receiptDocument({ title: hostile, kicker: hostile, heading: hostile, body: [], footer: [hostile], preheader: hostile }),
    ].join("");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("puts a web address in the button and refuses any other kind", () => {
    expect(receiptButton(url, "Go")).toContain('href="https://app.brandbasket.in/x?token=abc&amp;b=1"');
    expect(() => receiptButton("javascript:alert(1)", "Go")).toThrow(/http or https/);
  });

  it("wraps the card in the logo, a rattan label, the heading and the small print", () => {
    const html = receiptDocument({ title: "T", kicker: "Password reset", heading: "Reset it", body: [receiptParagraph("Body")], footer: ["Small print"] });
    expect(html).toContain(`src="${emailLogoUrl()}"`);
    expect(html).toContain(">Password reset</p>");
    expect(html).toContain(">Reset it</h1>");
    expect(html).toContain("Small print");
    expect(html).toContain("Arial,Helvetica,sans-serif");
  });
});

/** Every customer email, with what the Receipt layout must show for it. */
const CUSTOMER = [
  { name: "signup-code", kicker: "Verification code", mail: signupCodeEmail({ to, code: "482913", expiresInMinutes: 15 }), button: null },
  { name: "privacy-request-code", kicker: "Confirmation code", mail: privacyRequestCodeEmail({ to, code: "482913", expiresInMinutes: 15 }), button: null },
  { name: "confirm-email", kicker: "Confirm your email", mail: confirmEmailEmail({ to, confirmUrl: url, expiresInDays: 3 }), button: "Confirm my email" },
  { name: "password-reset", kicker: "Password reset", mail: passwordResetEmail({ to, resetUrl: url, expiresInMinutes: 30 }), button: "Choose a new password" },
  { name: "setup-link", kicker: "Set up your account", mail: setupLinkEmail({ to, businessName: "Rao Dental Care", setupUrl: url, expiresInDays: 7 }), button: "Set your password" },
  { name: "preview-ready", kicker: "Preview ready", mail: previewReadyEmail({ to, businessName: "Rao Dental Care", previewUrl: "https://preview.brandbasket.in/rao" }), button: "Open the preview" },
  { name: "website-live", kicker: "Website live", mail: websiteLiveEmail({ to, businessName: "Rao Dental Care", websiteUrl: "https://raodental.in/home" }), button: "Visit raodental.in" },
  { name: "domain-ready", kicker: "Connect your domain", mail: domainReadyEmail({ to, businessName: "Rao Dental Care", domain: "raodental.in", projectUrl: url }), button: "Connect my domain" },
  { name: "domain-moved", kicker: "Your own domain", mail: domainMovedEmail({ to, businessName: "Rao Dental Care", websiteUrl: "https://raodental.in", oldHostname: "rao.brandbasket.site" }), button: "Visit raodental.in" },
  {
    name: "payment-received",
    kicker: "Receipt for Rao Dental Care",
    mail: paymentReceivedEmail({
      to,
      ownerName: "Asha Rao",
      businessName: "Rao Dental Care",
      currency: "INR",
      lines: [{ label: "Managed Website", amountCents: 299900 }],
      gstRatePercent: 18,
      gstCents: 45746,
      totalCents: 299900,
      paidAt: new Date("2026-10-27T05:00:00Z"),
      invoiceUrl: url,
      logoUrl: "https://app.brandbasket.in/email/email-logo.png",
      nextPayment: null,
    }),
    button: "Download GST invoice",
  },
] as const;

describe("customer emails in the Receipt layout", () => {
  for (const { name, kicker, mail, button } of CUSTOMER) {
    it(`${name}: logo, label, heading and the right button`, () => {
      expect(mail.bodyHtml).toContain(`src="${emailLogoUrl()}"`);
      expect(mail.bodyHtml).toContain(`>${kicker}</p>`);
      expect(mail.bodyHtml).toContain(`<h1 `);
      if (button === null) expect(mail.bodyHtml).not.toContain("<a ");
      else expect(mail.bodyHtml).toContain(`>${button}</a>`);
    });

    it(`${name}: keeps its plain-text version and never uses a dash in its own words`, () => {
      expect(mail.bodyText.length).toBeGreaterThan(20);
      expect(mail.bodyText).not.toContain("<");
      expect(JSON.stringify(mail)).not.toMatch(/[–—]/);
    });
  }

  it("shows the code in a box and keeps it out of the outbox copy", () => {
    const mail = signupCodeEmail({ to, code: "482913", expiresInMinutes: 15 });
    expect(mail.bodyHtml).toContain(">482913</p>");
    expect(mail.outboxCopy?.bodyHtml).not.toContain("482913");
  });

  it("shows the link only as a button, and keeps it out of the outbox copy", () => {
    const mail = passwordResetEmail({ to, resetUrl: url, expiresInMinutes: 30 });
    expect(mail.outboxCopy?.bodyHtml).not.toContain("token=abc");
    expect(mail.outboxCopy?.bodyText).not.toContain("token=abc");
  });

  it("shows a quote as rows with the total in bold, and a reply in a quote bar", () => {
    const send = (update: ChangeRequestUpdate) => changeRequestUpdateEmail({ to, name: "Asha Rao", title: "Gallery page", requestUrl: url, update });
    const quote = send({ kind: "quote", line: "Gallery page, 12 photos", total: "₹1,500", workingDays: 3, note: "Includes resizing." });
    expect(quote.bodyHtml).toContain(">Quote</p>");
    expect(quote.bodyHtml).toContain(">Work</td>");
    expect(quote.bodyHtml).toMatch(/font-weight:bold;[^"]*">₹1,500</);
    expect(quote.bodyHtml).toContain(">Note</td>");
    const reply = send({ kind: "reply", body: "Done.\nSee you." });
    expect(reply.bodyHtml).toContain(">New reply</p>");
    expect(reply.bodyHtml).toContain("border-left:3px solid");
    expect(reply.bodyHtml).toContain("Done.\nSee you.");
  });

  it("uses a label for every kind of change request update", () => {
    const labels = { reply: "New reply", quote: "Quote", started: "In progress", ready: "Ready to check", done: "Done", closed: "Closed" } as const;
    const updates: ChangeRequestUpdate[] = [
      { kind: "reply", body: "x" },
      { kind: "quote", line: "x", total: "x", workingDays: 1 },
      { kind: "started", readyBy: null },
      { kind: "ready" },
      { kind: "done" },
      { kind: "closed", reason: null },
    ];
    for (const update of updates) {
      const mail = changeRequestUpdateEmail({ to, name: "Asha", title: "T", requestUrl: url, update });
      expect(mail.bodyHtml).toContain(`>${labels[update.kind]}</p>`);
    }
  });
});

const TEAM = [
  { name: "lead-received", kicker: "New lead", button: "Open the lead", mail: leadReceivedEmail({ to, name: "Asha", businessName: "Rao", businessType: "Clinic", email: "a@b.in", phone: null, message: "Hello", leadUrl: url }) },
  { name: "onboarding-sent", kicker: "Website details sent", button: "Open the client", mail: onboardingSentEmail({ to, businessName: "Rao", clientUrl: url, previewDueHours: 72 }) },
  { name: "preview-revisions-requested", kicker: "Changes requested", button: "Open the client", mail: previewRevisionsRequestedEmail({ to, businessName: "Rao", clientUrl: url }) },
  { name: "preview-approved", kicker: "Preview approved", button: "Open the client", mail: previewApprovedEmail({ to, businessName: "Rao", clientUrl: url }) },
  { name: "domain-requested", kicker: "Domain requested", button: "Open the client", mail: domainRequestedEmail({ to, businessName: "Rao", domain: "rao.in", clientUrl: url }) },
  { name: "domain-connected", kicker: "Domain connected", button: "Open the client", mail: domainConnectedEmail({ to, businessName: "Rao", domain: "rao.in", clientUrl: url }) },
  { name: "listing-enquiry", kicker: "New enquiry", button: "See all your enquiries", mail: listingEnquiryEmail({ to, businessName: "Rao", visitorName: "Ravi", visitorPhone: "99887 76655", message: null, dashboardUrl: url }) },
  { name: "booking-code", kicker: "Confirmation code", button: null, mail: bookingCodeEmail({ to, code: "482913", expiresInMinutes: 10 }) },
  { name: "privacy-request-alert", kicker: "Privacy request", button: "Open privacy requests", mail: privacyRequestAlertEmail({ to, reference: "PR-1", kindLabel: "Erase", dueDay: "Wed 25 Nov", consoleUrl: url }) },
  {
    name: "privacy-requests-due",
    kicker: "Privacy requests due",
    button: "Open privacy requests",
    mail: privacyRequestsDueEmail({ to, consoleUrl: url, items: [{ reference: "PR-1", kindLabel: "Erase", dueDay: "Wed 25 Nov", stage: "overdue", daysLeft: -2 }] }),
  },
  { name: "security-event-alert", kicker: "Security alert", button: "Open the console", mail: securityEventAlertEmail({ to, eventLabel: "Failed sign-ins", advice: "Check it.", count: 24, windowMinutes: 10, app: "console", consoleUrl: url }) },
  { name: "staff-access-review", kicker: "Staff access review", button: "Open the access log", mail: staffAccessReviewEmail({ to, hours: 24, consoleUrl: url, findings: [{ staff: "Priya N", what: "Exported invoices", count: 4 }] }) },
  { name: "support-ticket-alert", kicker: "Support request", button: "Open in Admin Console", mail: supportTicketAlertEmail({ to, reference: "SUP-1", ticketId: "t", category: "billing", categoryLabel: "Billing", subject: "S", description: "D", requesterEmail: "a@b.in", adminUrl: url }) },
  { name: "support-reply-alert", kicker: "Customer reply", button: "Open in Admin Console", mail: supportReplyAlertEmail({ to, reference: "SUP-1", ticketId: "t", subject: "S", body: "B", authorName: "Asha", adminUrl: url }) },
  { name: "system-error-alert", kicker: "System error", button: "Open in Admin Errors", mail: systemErrorAlertEmail({ to, app: "platform", operation: "Pay", errorClass: "Timeout", route: "/api/x", severity: "error", adminUrl: url }) },
] as const;

describe("team emails in the Receipt layout", () => {
  for (const { name, kicker, button, mail } of TEAM) {
    it(`${name}: logo, label, heading${button === null ? "" : " and the button"}`, () => {
      expect(mail.bodyHtml).toContain(`src="${emailLogoUrl()}"`);
      expect(mail.bodyHtml).toContain(`>${kicker}</p>`);
      expect(mail.bodyHtml).toContain("<h1 ");
      if (button !== null) expect(mail.bodyHtml).toContain(`>${button}</a>`);
      expect(JSON.stringify(mail)).not.toMatch(/[–—]/);
    });
  }

  it("keeps customer text out of the outbox copy of a support alert, and that copy stays plain", () => {
    const ticket = supportTicketAlertEmail({ to, reference: "SUP-1", ticketId: "t", category: "billing", categoryLabel: "Billing", subject: "Secret subject", description: "Secret description", requesterEmail: "a@b.in" });
    expect(ticket.outboxCopy?.bodyHtml).not.toContain("Secret");
    expect(ticket.outboxCopy?.bodyHtml).not.toContain(emailLogoUrl());
  });

  it("escapes a customer's words in a support alert", () => {
    const ticket = supportTicketAlertEmail({ to, reference: "SUP-1", ticketId: "t", category: "billing", categoryLabel: "Billing", subject: "<b>x</b>", description: "<script>alert(1)</script>", requesterEmail: "a@b.in" });
    expect(ticket.bodyHtml).not.toContain("<script>");
    expect(ticket.bodyHtml).not.toContain("<b>x</b>");
  });
});
