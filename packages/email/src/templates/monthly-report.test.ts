import { describe, expect, it } from "vitest";
import { monthlyReportEmail } from "./monthly-report";

const INPUT = {
  to: "owner@example.com",
  name: "Asha Kulkarni",
  serviceTitle: "Website",
  monthTitle: "October 2026",
  headline: "Your website was online 99.9% of the month and sent you 12 enquiries.",
  figures: [
    { label: "Online in October", value: "99.9% of 4,300 checks" },
    { label: "Enquiries from your website in October", value: "12" },
    { label: "Speed on phones, 29 Oct 2026", value: "82 out of 100" },
    { label: "Secure connection valid until", value: "12 Jan 2027" },
  ],
  reportUrl: "https://app.brandbasket.in/reports/2026-10",
  pdfUrl: "https://app.brandbasket.in/reports/2026-10/pdf?service=website",
} as const;

describe("monthlyReportEmail", () => {
  it("names the service and month, shows the first three figures and links the report", () => {
    const email = monthlyReportEmail(INPUT);
    expect(email.subject).toBe("Your Website report for October 2026");
    expect(email.template).toBe("monthly-report");
    expect(email.bodyText).toContain("Hi Asha,");
    expect(email.bodyText).toContain("Enquiries from your website in October: 12");
    expect(email.bodyText).toContain("Speed on phones, 29 Oct 2026: 82 out of 100");
    expect(email.bodyText).not.toContain("Secure connection");
    expect(email.bodyText).toContain("https://app.brandbasket.in/reports/2026-10");
    expect(email.bodyText).toContain("Download the PDF: https://app.brandbasket.in/reports/2026-10/pdf?service=website");
    expect(email.bodyHtml).toContain("https://app.brandbasket.in/reports/2026-10");
  });

  it("has no em or en dash and refuses a link that is not a web address", () => {
    const email = monthlyReportEmail(INPUT);
    expect(`${email.subject}${email.bodyText}`).not.toMatch(/[–—]/);
    expect(() => monthlyReportEmail({ ...INPUT, reportUrl: "javascript:alert(1)" })).toThrow();
  });
});
