import { describe, expect, it } from "vitest";
import { NOTIFICATION_TOPICS } from "../schema/notifications";
import { effectivePreferences, emailByDefault, resolveEmailPreference } from "./notifications";

describe("notification preferences", () => {
  it("emails every topic by default except product news", () => {
    expect(NOTIFICATION_TOPICS.filter((topic) => !emailByDefault(topic))).toEqual(["product_news"]);
  });

  it("uses the stored choice over the default, both ways", () => {
    expect(resolveEmailPreference("billing", undefined)).toBe(true);
    expect(resolveEmailPreference("billing", false)).toBe(false);
    expect(resolveEmailPreference("product_news", undefined)).toBe(false);
    expect(resolveEmailPreference("product_news", true)).toBe(true);
  });

  it("fills every topic from the rows a person has", () => {
    expect(effectivePreferences([{ topic: "new_enquiry", email: false }])).toEqual({
      new_enquiry: false,
      needs_approval: true,
      request_reply: true,
      billing: true,
      monthly_report: true,
      product_news: false,
    });
  });
});
