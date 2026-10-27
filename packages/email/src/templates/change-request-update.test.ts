import { describe, expect, it } from "vitest";
import { changeRequestUpdateEmail, type ChangeRequestUpdate } from "./change-request-update";

const BASE = { to: "priya@example.com", name: "Priya Shah", title: "Add an Implants page", requestUrl: "https://app.brandbasket.in/requests?open=0192f3c4" };
const send = (update: ChangeRequestUpdate, overrides: Partial<typeof BASE> = {}) => changeRequestUpdateEmail({ ...BASE, ...overrides, update });

describe("changeRequestUpdateEmail", () => {
  it("passes the team's reply on in full, with a way back to the request", () => {
    const email = send({ kind: "reply", body: "Happy to.\nA new page takes about 3 hours." });
    expect(email.subject).toBe("New reply: Add an Implants page");
    expect(email.template).toBe("change-request-reply");
    expect(email.bodyText).toBe(
      ['Hi Priya,', "", 'The Brandbasket team replied to "Add an Implants page":', "", "Happy to.", "A new page takes about 3 hours.", "", "Open your request: https://app.brandbasket.in/requests?open=0192f3c4"].join("\n"),
    );
    expect(email.bodyHtml).toContain("white-space:pre-wrap");
    expect(email.bodyHtml).toContain('href="https://app.brandbasket.in/requests?open=0192f3c4"');
    expect(email.bodyHtml).toContain(">Open your request</a>");
  });

  it("says what the quote is, what it comes to and when the work is ready after the customer pays", () => {
    const email = send({ kind: "quote", line: "New page, 3 hours at ₹500 an hour, GST included", total: "₹1,500", workingDays: 5 });
    expect(email.subject).toBe("Quoted: Add an Implants page");
    expect(email.bodyText).toContain("New page, 3 hours at ₹500 an hour, GST included");
    expect(email.bodyText).toContain("Total: ₹1,500");
    expect(email.bodyText).toContain("ready to check 5 working days after you pay.");
  });

  it("puts the team's note with a quote, when there is one", () => {
    const quote = { kind: "quote", line: "New page, 3 hours at ₹500 an hour, GST included", total: "₹1,500", workingDays: 5 } as const;
    expect(send({ ...quote, note: "Happy to. We use your photos." }).bodyText).toContain("Happy to. We use your photos.");
    expect(send({ ...quote, note: null }).bodyHtml).not.toContain("white-space:pre-wrap");
    expect(send(quote).bodyText).not.toContain("Happy to");
  });

  it("uses the five status words for starting, checking and finishing", () => {
    expect(send({ kind: "started", readyBy: "Tue 1 Dec" }).subject).toBe("In progress: Add an Implants page");
    expect(send({ kind: "started", readyBy: "Tue 1 Dec" }).bodyText).toContain("It will be ready to check by Tue 1 Dec.");
    expect(send({ kind: "started", readyBy: null }).bodyText).not.toContain("ready to check by");
    expect(send({ kind: "ready" }).subject).toBe("Ready to check: Add an Implants page");
    expect(send({ kind: "ready" }).bodyText).toContain("press Looks good");
    expect(send({ kind: "done" }).subject).toBe("Done: Add an Implants page");
  });

  it("gives the reason a request was closed, when there is one", () => {
    expect(send({ kind: "closed", reason: "We do not build online shops." }).bodyText).toContain("Why: We do not build online shops.");
    expect(send({ kind: "closed", reason: null }).bodyText).not.toContain("Why:");
    expect(send({ kind: "closed", reason: null }).subject).toBe("Closed: Add an Implants page");
  });

  it("escapes what a customer or a staff member typed, and keeps header fields to one line", () => {
    const email = send({ kind: "reply", body: "<script>alert(1)</script>" }, { title: 'Fix <b>this</b>\r\nBcc: someone@example.com', to: "priya@example.com\r\nBcc: x@example.com" });
    expect(email.bodyHtml).not.toContain("<script>");
    expect(email.bodyHtml).toContain("&lt;script&gt;");
    expect(email.bodyHtml).not.toContain("<b>this</b>");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.to).not.toMatch(/[\r\n]/);
  });

  it("refuses a link that is not a web address", () => {
    expect(() => send({ kind: "ready" }, { requestUrl: "javascript:alert(1)" })).toThrow(/http or https/);
  });

  it("greets a name it cannot split, and never uses a dash in its own words", () => {
    expect(send({ kind: "done" }, { name: "  " }).bodyText.startsWith("Hello,")).toBe(true);
    const all: ChangeRequestUpdate[] = [
      { kind: "reply", body: "Thanks." },
      { kind: "quote", line: "New page, 3 hours at ₹500 an hour, GST included", total: "₹1,500", workingDays: 5 },
      { kind: "started", readyBy: "Tue 1 Dec" },
      { kind: "ready" },
      { kind: "done" },
      { kind: "closed", reason: "Not for us." },
    ];
    for (const update of all) expect(JSON.stringify(send(update))).not.toMatch(/[–—]/);
  });
});
