import { describe, expect, it } from "vitest";
import { confirmEmailEmail } from "./confirm-email";
import { leadReceivedEmail } from "./lead-received";
import { listingEnquiryEmail } from "./listing-enquiry";
import { passwordResetEmail } from "./password-reset";
import { previewApprovedEmail } from "./preview-approved";
import { privacyRequestAlertEmail, privacyRequestsDueEmail } from "./privacy-request-alert";
import { securityEventAlertEmail, staffAccessReviewEmail } from "./security-alert";
import { previewReadyEmail } from "./preview-ready";
import { previewRevisionsRequestedEmail } from "./preview-revisions-requested";
import { setupLinkEmail } from "./setup-link";
import { signupCodeEmail } from "./signup-code";
import { supportReplyAlertEmail } from "./support-reply-alert";
import { supportTicketAlertEmail } from "./support-ticket-alert";
import { systemErrorAlertEmail } from "./system-error-alert";
import { websiteLiveEmail } from "./website-live";

describe("leadReceivedEmail", () => {
  const email = leadReceivedEmail({
    to: "team@example.com",
    name: "Riley Owner",
    businessName: "Riverside Plumbing",
    businessType: "Home services (plumbing, electrical, repairs)",
    email: "owner@example.com",
    phone: "+1 555 0100",
    message: "We need a site before summer.",
    leadUrl: "http://admin.localhost:3000/leads/0192f3c4",
  });

  it("names the business in the subject", () => {
    expect(email.subject).toBe("New lead: Riverside Plumbing");
  });

  it("includes the business type so the call can be prepared", () => {
    expect(email.bodyText).toContain("Business type: Home services (plumbing, electrical, repairs)");
  });

  it("carries every detail the team needs to make the call", () => {
    for (const detail of ["Riley Owner", "owner@example.com", "+1 555 0100", "summer"]) {
      expect(email.bodyText).toContain(detail);
      expect(email.bodyHtml).toContain(detail);
    }
    expect(email.bodyHtml).toContain("http://admin.localhost:3000/leads/0192f3c4");
  });

  it("escapes HTML in customer-supplied values", () => {
    const risky = leadReceivedEmail({
      to: "team@example.com",
      name: "<script>alert(1)</script>",
      businessName: "Bella & Co",
      businessType: "Home services (plumbing, electrical, repairs)",
      email: "owner@example.com",
      phone: "1",
      message: null,
      leadUrl: "http://admin.localhost:3000/leads/1",
    });
    expect(risky.bodyHtml).not.toContain("<script>");
    expect(risky.bodyHtml).toContain("&lt;script&gt;");
    expect(risky.bodyHtml).toContain("Bella &amp; Co");
  });
});

describe("setupLinkEmail", () => {
  const email = setupLinkEmail({
    to: "owner@example.com",
    businessName: "Riverside Plumbing",
    setupUrl: "http://app.localhost:3000/setup/token-123",
    expiresInDays: 7,
  });

  it("addresses the business and states how long the link lasts", () => {
    expect(email.subject).toBe("Set up your Fynix Digital account");
    expect(email.bodyText).toContain("Riverside Plumbing");
    expect(email.bodyText).toContain("7 days");
    expect(email.bodyHtml).toContain("7 days");
  });

  it("includes the link in both bodies", () => {
    expect(email.bodyText).toContain("http://app.localhost:3000/setup/token-123");
    expect(email.bodyHtml).toContain('href="http://app.localhost:3000/setup/token-123"');
  });
});

describe("previewReadyEmail", () => {
  const email = previewReadyEmail({
    to: "owner@example.com",
    businessName: "Riverside Plumbing",
    previewUrl: "https://riverside-plumbing-preview.vercel.app",
  });

  it("names the business in the subject", () => {
    expect(email.subject).toBe("Your Fynix Digital preview is ready");
    expect(email.bodyText).toContain("Riverside Plumbing");
  });

  it("includes the link in both bodies", () => {
    expect(email.bodyText).toContain("https://riverside-plumbing-preview.vercel.app");
    expect(email.bodyHtml).toContain('href="https://riverside-plumbing-preview.vercel.app"');
  });

  it("refuses a preview link that is not http or https", () => {
    expect(() =>
      previewReadyEmail({ to: "owner@example.com", businessName: "Riverside Plumbing", previewUrl: "javascript:alert(1)" }),
    ).toThrow("previewUrl must use http or https");
  });

  it("escapes the business name", () => {
    const risky = previewReadyEmail({
      to: "owner@example.com",
      businessName: "<script>alert(1)</script> & Co",
      previewUrl: "https://example.com",
    });
    expect(risky.bodyHtml).not.toContain("<script>");
    expect(risky.bodyHtml).toContain("&lt;script&gt;");
    expect(risky.bodyHtml).toContain("&amp; Co");
  });
});

describe("previewApprovedEmail", () => {
  const email = previewApprovedEmail({
    to: "team@example.com",
    businessName: "Riverside Plumbing",
    clientUrl: "http://admin.localhost:3000/clients/0192f3c4",
  });

  it("names the business in the subject", () => {
    expect(email.subject).toBe("Riverside Plumbing approved their preview");
  });

  it("links to the client in both bodies", () => {
    expect(email.bodyText).toContain("http://admin.localhost:3000/clients/0192f3c4");
    expect(email.bodyHtml).toContain('href="http://admin.localhost:3000/clients/0192f3c4"');
  });
});

describe("previewRevisionsRequestedEmail", () => {
  const email = previewRevisionsRequestedEmail({
    to: "team@example.com",
    businessName: "Riverside Plumbing",
    clientUrl: "http://admin.localhost:3000/clients/0192f3c4",
  });

  it("names the business in the subject", () => {
    expect(email.subject).toBe("Riverside Plumbing asked for changes");
  });

  it("points the team at booking a call rather than carrying written detail", () => {
    expect(email.bodyText).toContain("book a call");
    expect(email.bodyHtml).toContain("book a call");
  });

  it("links to the client in both bodies", () => {
    expect(email.bodyText).toContain("http://admin.localhost:3000/clients/0192f3c4");
    expect(email.bodyHtml).toContain('href="http://admin.localhost:3000/clients/0192f3c4"');
  });

  it("escapes the business name", () => {
    const risky = previewRevisionsRequestedEmail({
      to: "team@example.com",
      businessName: "<script>alert(1)</script> & Co",
      clientUrl: "http://admin.localhost:3000/clients/0192f3c4",
    });
    expect(risky.bodyHtml).not.toContain("<script>");
    expect(risky.bodyHtml).toContain("&lt;script&gt;");
    expect(risky.bodyHtml).toContain("&amp; Co");
  });
});

describe("websiteLiveEmail", () => {
  const email = websiteLiveEmail({
    to: "owner@example.com",
    businessName: "Riverside Plumbing",
    websiteUrl: "https://riverside-plumbing.com",
  });

  it("names the business in the subject", () => {
    expect(email.subject).toBe("Your Fynix Digital website is live");
    expect(email.bodyText).toContain("Riverside Plumbing");
  });

  it("includes the live link in both bodies", () => {
    expect(email.bodyText).toContain("https://riverside-plumbing.com");
    expect(email.bodyHtml).toContain('href="https://riverside-plumbing.com"');
  });

  it("refuses a website link that is not http or https", () => {
    expect(() =>
      websiteLiveEmail({ to: "owner@example.com", businessName: "Riverside Plumbing", websiteUrl: "javascript:alert(1)" }),
    ).toThrow("websiteUrl must use http or https");
  });

  it("escapes the business name", () => {
    const risky = websiteLiveEmail({
      to: "owner@example.com",
      businessName: "<script>alert(1)</script> & Co",
      websiteUrl: "https://example.com",
    });
    expect(risky.bodyHtml).not.toContain("<script>");
    expect(risky.bodyHtml).toContain("&lt;script&gt;");
    expect(risky.bodyHtml).toContain("&amp; Co");
  });
});

describe("privacy request alerts", () => {
  const CONSOLE = "https://console.fynix.digital/privacy-requests";

  it("announces a new request with its reference, kind, due day and a console link, and nothing about the person", () => {
    const message = privacyRequestAlertEmail({ to: "hello@fynix.digital", reference: "PR-7K2M9QXD", kindLabel: "Erasure", dueDay: "12 November 2026", consoleUrl: CONSOLE });
    expect(message.subject).toBe("New privacy request PR-7K2M9QXD (Erasure)");
    expect(message.template).toBe("privacy-request-alert");
    for (const body of [message.bodyText, message.bodyHtml]) {
      expect(body).toContain("PR-7K2M9QXD");
      expect(body).toContain("12 November 2026");
      expect(body).toContain(CONSOLE);
    }
    expect(message.outboxCopy).toBeUndefined();
  });

  it("refuses a console link that is not http or https, and keeps a header-breaking subject out", () => {
    expect(() => privacyRequestAlertEmail({ to: "a@b.in", reference: "PR-1", kindLabel: "Erasure", dueDay: "x", consoleUrl: "javascript:alert(1)" })).toThrow("consoleUrl");
    const message = privacyRequestAlertEmail({ to: "a@b.in\nBcc: x@y.in", reference: "PR-1\r\nX: y", kindLabel: "Erasure", dueDay: "x", consoleUrl: CONSOLE });
    expect(message.to).not.toMatch(/[\r\n]/);
    expect(message.subject).not.toMatch(/[\r\n]/);
  });

  it("lists each open request with its stage and how many days are left or overdue", () => {
    const message = privacyRequestsDueEmail({
      to: "hello@fynix.digital",
      consoleUrl: CONSOLE,
      items: [
        { reference: "PR-LATE0001", kindLabel: "Grievance", dueDay: "5 November 2026", stage: "overdue", daysLeft: -3 },
        { reference: "PR-SOON0002", kindLabel: "Erasure", dueDay: "18 November 2026", stage: "urgent", daysLeft: 5 },
        { reference: "PR-DAY20003", kindLabel: "Access to their data", dueDay: "23 November 2026", stage: "reminder", daysLeft: 10 },
      ],
    });
    expect(message.subject).toBe("1 privacy request is overdue (3 need attention)");
    expect(message.bodyText).toContain("Overdue: PR-LATE0001 (Grievance), was due 5 November 2026, 3 days ago");
    expect(message.bodyText).toContain("Urgent: PR-SOON0002 (Erasure), due 18 November 2026, 5 days left");
    expect(message.bodyText).toContain("Reminder: PR-DAY20003 (Access to their data), due 23 November 2026, 10 days left");
    expect(message.bodyHtml).toContain(CONSOLE);
  });

  it("words a quiet night's email without 'overdue', handles a due-today request, and refuses an empty list", () => {
    const one = privacyRequestsDueEmail({ to: "a@b.in", consoleUrl: CONSOLE, items: [{ reference: "PR-1", kindLabel: "Erasure", dueDay: "12 November 2026", stage: "urgent", daysLeft: 0 }] });
    expect(one.subject).toBe("1 privacy request needs an answer soon");
    expect(one.bodyText).toContain("due today, 12 November 2026");
    expect(() => privacyRequestsDueEmail({ to: "a@b.in", consoleUrl: CONSOLE, items: [] })).toThrow("at least one");
  });
});

describe("security alerts", () => {
  it("says what happened, how many and over what time, with the runbook and the CERT-In clock", () => {
    const message = securityEventAlertEmail({
      to: "hello@fynix.digital",
      eventLabel: "Sign-ins blocked for too many tries",
      advice: "Many accounts or addresses are being tried.",
      count: 20,
      windowMinutes: 60,
      app: "platform",
      consoleUrl: "https://console.fynix.digital/access-log",
    });
    expect(message.subject).toBe("[Security] Sign-ins blocked for too many tries (20 or more in 60 minutes)");
    expect(message.template).toBe("security-event-alert");
    for (const body of [message.bodyText, message.bodyHtml]) {
      expect(body).toContain("BREACH-RESPONSE.md");
      expect(body).toContain("6 hours");
    }
    expect(() => securityEventAlertEmail({ to: "a@b.in", eventLabel: "x", advice: "y", count: 1, windowMinutes: 1, app: "platform", consoleUrl: "javascript:alert(1)" })).toThrow("consoleUrl");
  });

  it("lists each staff finding in the nightly review, and refuses an empty review", () => {
    const message = staffAccessReviewEmail({
      to: "hello@fynix.digital",
      hours: 24,
      consoleUrl: "https://console.fynix.digital/access-log",
      findings: [{ staff: "asha@fynix.digital", what: "Exported the invoice register", count: 5 }],
    });
    expect(message.subject).toBe("[Security] Staff access review: 1 item to check");
    expect(message.bodyText).toContain("asha@fynix.digital: Exported the invoice register, 5 times");
    expect(() => staffAccessReviewEmail({ to: "a@b.in", hours: 24, consoleUrl: "https://console.fynix.digital/access-log", findings: [] })).toThrow("at least one");
  });
});

describe("defending the package itself", () => {
  it("strips line breaks from subjects and addresses", () => {
    const email = leadReceivedEmail({
      to: "team@example.com\r\nBcc: attacker@example.com",
      name: "Riley",
      businessName: "Bella\r\nSubject: hijacked",
      businessType: "Home services (plumbing, electrical, repairs)",
      email: "owner@example.com",
      phone: "1",
      message: null,
      leadUrl: "http://admin.localhost:3000/leads/1",
    });

    expect(email.to).toBe("team@example.com Bcc: attacker@example.com");
    expect(email.subject).toBe("New lead: Bella Subject: hijacked");
    expect(email.subject).not.toContain("\n");
  });

  it("refuses links that are not http or https", () => {
    expect(() =>
      setupLinkEmail({
        to: "owner@example.com",
        businessName: "Riverside Plumbing",
        setupUrl: "javascript:alert(1)",
        expiresInDays: 7,
      }),
    ).toThrow("setupUrl must use http or https");

    expect(() =>
      leadReceivedEmail({
        to: "team@example.com",
        name: "Riley",
        businessName: "Riverside Plumbing",
        businessType: "Home services (plumbing, electrical, repairs)",
        email: "owner@example.com",
        phone: "1",
          message: null,
        leadUrl: "not-a-url",
      }),
    ).toThrow("leadUrl must be an absolute http or https URL");
  });

  it("escapes the business name in the setup link email", () => {
    const email = setupLinkEmail({
      to: "owner@example.com",
      businessName: "<script>alert(1)</script> & Co",
      setupUrl: "http://app.localhost:3000/setup/token-123",
      expiresInDays: 7,
    });

    expect(email.bodyHtml).not.toContain("<script>");
    expect(email.bodyHtml).toContain("&lt;script&gt;");
    expect(email.bodyHtml).toContain("&amp; Co");
  });

  it("declares a character set so accented names survive", () => {
    const email = setupLinkEmail({
      to: "owner@example.com",
      businessName: "Café Niño",
      setupUrl: "http://app.localhost:3000/setup/token-123",
      expiresInDays: 7,
    });

    expect(email.bodyHtml).toContain('<meta charset="utf-8" />');
    expect(email.bodyHtml).toContain("Café Niño");
  });
});

describe("passwordResetEmail", () => {
  const email = passwordResetEmail({ to: "owner@example.com", resetUrl: "http://app.localhost:3000/reset-password/abc123", expiresInMinutes: 60 });

  it("carries the link, how long it lasts, and that ignoring it changes nothing", () => {
    expect(email.subject).toBe("Reset your Fynix Digital password");
    expect(email.template).toBe("password-reset");
    for (const body of [email.bodyText, email.bodyHtml]) {
      expect(body).toContain("http://app.localhost:3000/reset-password/abc123");
      expect(body).toContain("expires in 60 minutes");
      expect(body).toContain("your password stays as it is");
    }
  });

  it("refuses a link that is not a web address", () => {
    expect(() => passwordResetEmail({ to: "owner@example.com", resetUrl: "javascript:alert(1)", expiresInMinutes: 60 })).toThrow("resetUrl");
  });
});

describe("confirmEmailEmail", () => {
  const email = confirmEmailEmail({ to: "owner@example.com", confirmUrl: "http://app.localhost:3000/confirm-email/tok.en", expiresInDays: 3 });

  it("carries the link and how long it lasts", () => {
    expect(email.subject).toBe("Confirm your email for Fynix Digital");
    expect(email.template).toBe("confirm-email");
    for (const body of [email.bodyText, email.bodyHtml]) {
      expect(body).toContain("http://app.localhost:3000/confirm-email/tok.en");
      expect(body).toContain("expires in 3 days");
    }
  });

  it("refuses a link that is not a web address", () => {
    expect(() => confirmEmailEmail({ to: "owner@example.com", confirmUrl: "/confirm-email/x", expiresInDays: 3 })).toThrow("confirmUrl");
  });
});

describe("listingEnquiryEmail", () => {
  const input = {
    to: "owner@example.com",
    businessName: "Smile Dental",
    visitorName: "Asha",
    visitorPhone: "+91 98200 41009",
    message: "Do you do braces for kids?",
    dashboardUrl: "http://app.localhost:3000/business",
  };

  it("gives the owner everything needed to call the visitor back", () => {
    const email = listingEnquiryEmail(input);
    expect(email.subject).toBe("New enquiry for Smile Dental");
    expect(email.template).toBe("listing-enquiry");
    for (const body of [email.bodyText, email.bodyHtml]) {
      for (const detail of ["Asha", "+91 98200 41009", "braces for kids", "http://app.localhost:3000/business"]) {
        expect(body).toContain(detail);
      }
    }
  });

  it("says so when the visitor left no message", () => {
    expect(listingEnquiryEmail({ ...input, message: null }).bodyText).toContain("They left no message.");
  });

  it("escapes what the visitor typed, and keeps a line break out of the subject", () => {
    const risky = listingEnquiryEmail({ ...input, businessName: "Bella & Co\r\nBcc: x@example.com", visitorName: "<b>Asha</b>" });
    expect(risky.subject).not.toMatch(/[\r\n]/);
    expect(risky.bodyHtml).not.toContain("<b>Asha</b>");
    expect(risky.bodyHtml).toContain("&lt;b&gt;Asha&lt;/b&gt;");
  });
});

describe("supportTicketAlertEmail", () => {
  const input = {
    to: "hello@fynix.digital",
    reference: "SUP-2026-A1B2",
    ticketId: "0192f3c4-1234-7000-8000-000000000001",
    category: "bug",
    categoryLabel: "Report a bug",
    subject: "Cannot upload photos",
    description: "The upload button spins forever.",
    requesterEmail: "owner@example.com",
    requesterName: "Dr. Smith",
    requesterPhone: "+91 98200 11111",
    businessName: "Smith Clinic",
    businessId: "biz-123",
    details: { stepsToReproduce: "1. Click upload. 2. Select file." },
    attachmentCount: 2,
    browserDevice: "Chrome on macOS",
    adminUrl: "http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001",
  };

  it("formats subject with category, subject, and reference", () => {
    const email = supportTicketAlertEmail(input);
    expect(email.subject).toBe("[Report a bug] Cannot upload photos (SUP-2026-A1B2)");
    expect(email.to).toBe("hello@fynix.digital");
    expect(email.template).toBe("support-ticket-alert");
  });

  it("contains ticket details, attachments count, and admin link", () => {
    const email = supportTicketAlertEmail(input);
    for (const body of [email.bodyText, email.bodyHtml]) {
      expect(body).toContain("SUP-2026-A1B2");
      expect(body).toContain("Dr. Smith");
      expect(body).toContain("owner@example.com");
      expect(body).toContain("Smith Clinic");
      expect(body).toContain("The upload button spins forever.");
      expect(body).toContain("2 screenshot(s)");
      expect(body).toContain("http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001");
    }
  });

  it("keeps only the reference, category, status and link in the outbox copy", () => {
    const copy = supportTicketAlertEmail({ ...input, statusLabel: "New" }).outboxCopy;
    expect(copy).toBeDefined();
    for (const body of [copy?.subject, copy?.bodyText, copy?.bodyHtml]) {
      expect(body).toContain("SUP-2026-A1B2");
    }
    for (const body of [copy?.bodyText, copy?.bodyHtml]) {
      expect(body).toContain("Report a bug");
      expect(body).toContain("New");
      expect(body).toContain("http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001");
    }
    const everything = JSON.stringify(copy);
    for (const secret of ["Cannot upload photos", "The upload button spins forever.", "Dr. Smith", "owner@example.com", "98200 11111", "Smith Clinic", "Click upload", "Chrome on macOS"]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("escapes user-supplied content in html", () => {
    const risky = supportTicketAlertEmail({
      ...input,
      subject: "Test <script>",
      description: "Broken <b>tag</b> & more",
    });
    expect(risky.bodyHtml).not.toContain("<script>");
    expect(risky.bodyHtml).toContain("&lt;script&gt;");
    expect(risky.bodyHtml).toContain("&amp; more");
  });
});

describe("supportReplyAlertEmail", () => {
  const input = {
    to: "hello@fynix.digital",
    reference: "SUP-2026-A1B2",
    ticketId: "0192f3c4-1234-7000-8000-000000000001",
    subject: "Cannot upload photos",
    body: "Still happening today on Chrome.",
    authorName: "Dr. Smith",
    authorEmail: "owner@example.com",
    attachmentCount: 1,
    adminUrl: "http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001",
  };

  it("formats subject and contains customer reply details", () => {
    const email = supportReplyAlertEmail(input);
    expect(email.subject).toBe("[Customer Reply] Cannot upload photos (SUP-2026-A1B2)");
    expect(email.to).toBe("hello@fynix.digital");
    expect(email.template).toBe("support-reply-alert");
    for (const body of [email.bodyText, email.bodyHtml]) {
      expect(body).toContain("Still happening today on Chrome.");
      expect(body).toContain("Dr. Smith");
      expect(body).toContain("1 screenshot(s)");
      expect(body).toContain("http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001");
    }
  });

  it("keeps only the reference, category, status and link in the outbox copy", () => {
    const copy = supportReplyAlertEmail({ ...input, categoryLabel: "Report a bug", statusLabel: "In progress" }).outboxCopy;
    for (const body of [copy?.bodyText, copy?.bodyHtml]) {
      expect(body).toContain("SUP-2026-A1B2");
      expect(body).toContain("Report a bug");
      expect(body).toContain("In progress");
      expect(body).toContain("http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001");
    }
    const everything = JSON.stringify(copy);
    for (const secret of ["Cannot upload photos", "Still happening today on Chrome.", "Dr. Smith", "owner@example.com"]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe("systemErrorAlertEmail", () => {
  const input = {
    to: "hello@fynix.digital",
    app: "platform",
    operation: "server_action",
    errorClass: "DatabaseConnectionTimeout",
    route: "/app-host/photos",
    severity: "error",
    release: "v1.2.3",
    browser: "Safari",
    eventId: "evt-999",
    adminUrl: "http://admin.localhost:3003/support/errors",
  };

  it("formats system error alert email", () => {
    const email = systemErrorAlertEmail(input);
    expect(email.subject).toBe("[System Error] DatabaseConnectionTimeout on /app-host/photos (platform)");
    expect(email.template).toBe("system-error-alert");
    for (const body of [email.bodyText, email.bodyHtml]) {
      expect(body).toContain("DatabaseConnectionTimeout");
      expect(body).toContain("/app-host/photos");
      expect(body).toContain("evt-999");
      expect(body).toContain("http://admin.localhost:3003/support/errors");
    }
  });
});

describe("emails that sign someone in keep their link out of the outbox", () => {
  const TOKEN = "Kq8vR2mN4tY7wZ1x";
  const cases = [
    ["password-reset", passwordResetEmail({ to: "asha@example.in", resetUrl: `https://app.fynix.digital/reset-password/${TOKEN}`, expiresInMinutes: 60 })],
    ["confirm-email", confirmEmailEmail({ to: "asha@example.in", confirmUrl: `https://app.fynix.digital/confirm-email/${TOKEN}`, expiresInDays: 7 })],
    ["setup-link", setupLinkEmail({ to: "asha@example.in", businessName: "Bloom Dental", setupUrl: `https://app.fynix.digital/setup/${TOKEN}`, expiresInDays: 7 })],
  ] as const;

  it.each(cases)("%s sends the link to the recipient", (_name, message) => {
    expect(message.bodyText).toContain(TOKEN);
    expect(message.bodyHtml).toContain(TOKEN);
  });

  it.each(cases)("%s stores a copy that withholds the link", (_name, message) => {
    expect(message.outboxCopy?.linkWithheld).toBe(true);
    expect(message.outboxCopy?.subject).toBe(message.subject);
    expect(message.outboxCopy?.bodyText).not.toContain(TOKEN);
    expect(message.outboxCopy?.bodyHtml).not.toContain(TOKEN);
    expect(message.outboxCopy?.bodyText).toContain("The link was sent to the recipient and is not stored here.");
  });
});

describe("the staff-sent customer emails", () => {
  it("speak as Fynix Digital", () => {
    expect(setupLinkEmail({ to: "o@example.com", businessName: "Acme", setupUrl: "https://app.fynix.digital/setup/t", expiresInDays: 7 }).subject).toBe("Set up your Fynix Digital account");
    expect(websiteLiveEmail({ to: "o@example.com", businessName: "Acme", websiteUrl: "https://acme.example" }).subject).toBe("Your Fynix Digital website is live");
    expect(previewReadyEmail({ to: "o@example.com", businessName: "Acme", previewUrl: "https://preview.example/acme" }).subject).toBe("Your Fynix Digital preview is ready");
  });
});

describe("signupCodeEmail", () => {
  const input = { to: "owner@example.com", code: "482913", expiresInMinutes: 10 };
  const email = signupCodeEmail(input);

  it("carries the code and how long it lasts, ", () => {
    expect(email.template).toBe("signup-code");
    expect(email.subject).toBe("Your Fynix Digital verification code");
    for (const body of [email.bodyText, email.bodyHtml]) {
      expect(body).toContain("482913");
      expect(body).toContain("expires in 10 minutes");
      expect(body).toContain("Fynix Digital");
    }
    for (const text of [email.subject, email.bodyText, email.bodyHtml, email.outboxCopy?.subject ?? "", email.outboxCopy?.bodyText ?? ""]) {
      expect(text).not.toMatch(/first\s?fold/i);
    }
  });

  it("keeps the code out of the subject, and out of the copy the outbox stores", () => {
    expect(email.subject).not.toContain("482913");
    expect(email.outboxCopy?.subject).not.toContain("482913");
    expect(email.outboxCopy?.bodyText).not.toContain("482913");
    expect(email.outboxCopy?.bodyHtml).not.toContain("482913");
    expect(email.outboxCopy?.bodyText).toContain("not stored here");
    // Local development reads the code from the outbox: this flag lets only that inbox keep the full message.
    expect(email.outboxCopy?.linkWithheld).toBe(true);
  });

  it("refuses anything but a six-digit code, so nothing else can be written into the message", () => {
    for (const code of ["12345", "1234567", "12345a", "<b>1</b>", ""]) {
      expect(() => signupCodeEmail({ ...input, code })).toThrow("code");
    }
  });

  it("is addressed without header-breaking characters", () => {
    expect(signupCodeEmail({ ...input, to: "owner@example.com\r\nBcc: x@y.z" }).to).not.toMatch(/[\r\n]/);
  });
});
