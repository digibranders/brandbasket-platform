import { describe, expect, it } from "vitest";
import { parseSupportTicketForm, supportDetailsSchema, supportReplySchema, supportTicketSchema } from "./support-form";
import { canTransitionSupportStatus, SUPPORT_CATEGORIES } from "./support";

const valid = { category: "bug", subject: " Save failed ", description: " Saving the page reports an error. ", submissionKey: "submit-12345678" };

describe("support submissions", () => {
  it("trims text and accepts accounts without a business", () => {
    expect(supportTicketSchema.parse(valid)).toMatchObject({ subject: "Save failed", description: "Saving the page reports an error." });
  });
  it("validates every category and rejects unbounded content", () => {
    for (const category of SUPPORT_CATEGORIES) expect(supportTicketSchema.safeParse({ ...valid, category }).success).toBe(true);
    expect(supportTicketSchema.safeParse({ ...valid, subject: "ab" }).success).toBe(false);
    expect(supportTicketSchema.safeParse({ ...valid, description: "x".repeat(5001) }).success).toBe(false);
  });
  it("limits attachments and conditional details", () => {
    expect(supportTicketSchema.safeParse({ ...valid, attachmentIds: Array(4).fill("019c81e2-4436-7abb-9523-56603dc2a008") }).success).toBe(false);
    expect(supportTicketSchema.safeParse({ ...valid, details: { stepsToReproduce: "x".repeat(2001) } }).success).toBe(false);
  });
  it("rejects empty replies and duplicate attachment ids", () => {
    expect(supportReplySchema.safeParse({ body: " ", submissionKey: valid.submissionKey }).success).toBe(false);
    expect(supportTicketSchema.safeParse({ ...valid, attachmentIds: Array(2).fill("019c81e2-4436-7abb-9523-56603dc2a008") }).success).toBe(false);
  });
  it("discards stale category details and leaves technical context off by default", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...valid, category: "billing", stepsToReproduce: "A stale bug detail", invoiceReference: "INV-1" })) form.set(key, value);
    const parsed = parseSupportTicketForm(form);
    expect(parsed.success && parsed.data.details).toEqual({ invoiceReference: "INV-1" });
  });
  it("bounds structured details by encoded UTF8 bytes", () => {
    expect(supportDetailsSchema.safeParse({ stepsToReproduce: "界".repeat(1900), expectedBehavior: "界".repeat(1900) }).success).toBe(false);
  });
});

describe("support form messages", () => {
  const key = "submit-12345678";
  function form(fields: Record<string, string | undefined>): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) if (value !== undefined) data.set(name, value);
    return data;
  }

  it("asks for a category in plain words when none is chosen", () => {
    expect(parseSupportTicketForm(form({ subject: "Save failed", description: "Saving the page reports an error.", submissionKey: key }))).toEqual({
      success: false, message: "Choose a category.", field: "category",
    });
    expect(parseSupportTicketForm(form({ category: "", subject: "Save failed", description: "Saving the page reports an error.", submissionKey: key }))).toMatchObject({ message: "Choose a category.", field: "category" });
    expect(parseSupportTicketForm(form({ category: "not-a-category", subject: "Save failed", description: "Saving the page reports an error.", submissionKey: key }))).toMatchObject({ message: "Choose a category." });
  });

  it("never shows raw validation text to a customer", () => {
    const base = { category: "bug", subject: "Save failed", description: "Saving the page reports an error.", submissionKey: key };
    const bad: Record<string, string | undefined>[] = [
      { ...base, category: undefined }, { ...base, subject: undefined }, { ...base, subject: "ab" }, { ...base, subject: "x".repeat(121) },
      { ...base, description: undefined }, { ...base, description: "short" }, { ...base, description: "x".repeat(5001) },
      { ...base, submissionKey: undefined }, { ...base, submissionKey: "no" }, { ...base, submissionKey: "has spaces here" },
      { ...base, businessId: "not-a-uuid" }, { ...base, stepsToReproduce: "x".repeat(2001) },
    ];
    for (const fields of bad) {
      const result = parseSupportTicketForm(form(fields));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).not.toMatch(/invalid|expected|received|unrecognized|string|enum|uuid|too (small|big)|at least \d+ character\(s\)/i);
        expect(result.message.length).toBeGreaterThan(5);
      }
    }
  });

  it("uses plain messages for replies and bad attachment lists", () => {
    expect(supportReplySchema.safeParse({ body: "  ", submissionKey: key }).error?.issues[0]?.message).toBe("Write a reply.");
    expect(supportReplySchema.safeParse({ body: null, submissionKey: key }).error?.issues[0]?.message).toBe("Write a reply.");
    expect(supportReplySchema.safeParse({ body: "Hi", submissionKey: key, attachmentIds: ["nope"] }).error?.issues[0]?.message).toBe("One of the screenshots could not be used. Remove it and try again.");
  });
});

describe("support stages", () => {
  it("allows triage and completion while keeping closed tickets terminal", () => {
    expect(canTransitionSupportStatus("new", "triaged")).toBe(true);
    expect(canTransitionSupportStatus("waiting_on_you", "triaged")).toBe(true);
    expect(canTransitionSupportStatus("resolved", "triaged")).toBe(true);
    expect(canTransitionSupportStatus("closed", "new")).toBe(false);
    expect(canTransitionSupportStatus("new", "new")).toBe(true);
  });
});
