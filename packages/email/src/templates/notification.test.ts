import { describe, expect, it } from "vitest";
import { notificationEmail } from "./notification";

describe("notificationEmail", () => {
  const input = {
    to: "owner@example.com",
    template: "kickoff-booked",
    subject: "Your kickoff call is booked for 3 pm",
    paragraphs: ["Your kickoff call is booked for 3 pm"],
    button: { label: "Join here", url: "https://app.example.com/help" },
  };

  it("carries the subject, the paragraphs and the button link in both bodies", () => {
    const email = notificationEmail(input);
    expect(email).toMatchObject({ to: "owner@example.com", subject: input.subject, template: "kickoff-booked" });
    expect(email.bodyText).toContain("Your kickoff call is booked for 3 pm");
    expect(email.bodyText).toContain("https://app.example.com/help");
    expect(email.bodyHtml).toContain("Join here");
    expect(email.bodyHtml).toContain("https://app.example.com/help");
  });

  it("needs no button", () => {
    const email = notificationEmail({ ...input, button: undefined });
    expect(email.bodyText).not.toContain("https://");
  });

  it("escapes text that came from a customer", () => {
    const email = notificationEmail({ ...input, paragraphs: ["<script>x</script> & more"] });
    expect(email.bodyHtml).not.toContain("<script>");
    expect(email.bodyHtml).toContain("&lt;script&gt;");
  });

  it("refuses a link that is not http or https", () => {
    expect(() => notificationEmail({ ...input, button: { label: "Go", url: "javascript:alert(1)" } })).toThrow(/http/);
  });

  it("keeps a line break out of the subject", () => {
    expect(notificationEmail({ ...input, subject: "A\r\nBcc: x@example.com" }).subject).not.toMatch(/[\r\n]/);
  });
});
