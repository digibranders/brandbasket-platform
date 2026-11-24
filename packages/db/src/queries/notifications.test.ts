import { describe, expect, it } from "vitest";
import { NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS } from "../schema/notifications";
import { channelDefaults, effectivePreferences, emailByDefault, resolveChoices, resolveEmailPreference } from "./notifications";

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

  it("defaults the bell on and push off, so push is never on until the person opts in", () => {
    for (const topic of NOTIFICATION_TOPICS) expect(channelDefaults(topic).push).toBe(false);
    expect(NOTIFICATION_TOPICS.filter((topic) => !channelDefaults(topic).bell)).toEqual(["product_news"]);
  });

  it("covers every channel in a default", () => {
    expect(Object.keys(channelDefaults("calls")).sort()).toEqual([...NOTIFICATION_CHANNELS].sort());
  });

  it("fills a channel the stored row leaves out from the topic default", () => {
    expect(resolveChoices("product_news", { bell: true })).toEqual({ bell: true, email: false, push: false });
    expect(resolveChoices("billing", { email: false })).toEqual({ bell: true, email: false, push: false });
    expect(resolveChoices("billing", undefined)).toEqual({ bell: true, email: true, push: false });
  });

  it("fills every topic from the rows a person has", () => {
    const choices = effectivePreferences([{ topic: "new_enquiry", email: false, bell: true, push: true }]);
    expect(choices.new_enquiry).toEqual({ email: false, bell: true, push: true });
    expect(choices.calls).toEqual({ email: true, bell: true, push: false });
    expect(choices.social).toEqual({ email: true, bell: true, push: false });
    expect(choices.product_news).toEqual({ email: false, bell: false, push: false });
    expect(Object.keys(choices).sort()).toEqual([...NOTIFICATION_TOPICS].sort());
  });
});
