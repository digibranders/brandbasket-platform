import { describe, expect, it } from "vitest";
import { NOTIFICATION_TOPICS } from "@brandbasket/db";
import {
  ALWAYS_SENT_LINES,
  EVENTS_WITHOUT_WORDING,
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_EVENTS,
  bellCopyFor,
  emailCopyFor,
  eventDefinition,
  isNotificationEventKey,
  pushCopyFor,
} from "./notification-events";

/** Every row of docs/notifications/02-target-matrix.md sections A to F that notify() carries, by key. */
const MATRIX_EVENTS = [
  "kickoff.booked",
  "kickoff.booked.staff",
  "kickoff.soon",
  "kickoff.ended",
  "kickoff.completed",
  "kickoff.not_joined",
  "kickoff.reschedule",
  "kickoff.fallback_started.staff",
  "kickoff.fallback_started",
  "call.changed.staff",
  "billing.payment_received",
  "billing.payment_failed",
  "billing.payment_failed.staff",
  "billing.renewal_upcoming",
  "billing.plan_lapsed",
  "billing.refund",
  "billing.unapplied_payment",
  "billing.payment_needs_look.staff",
  "website.started",
  "website.preview_ready",
  "website.changes_sent",
  "website.changes_or_approved.staff",
  "website.approval_received",
  "website.live",
  "website.domain_ready",
  "request.received",
  "request.reply",
  "request.new.staff",
  "social.post_failed",
  "social.connection_expiring",
  "social.poster_ready",
  "social.poster_auto_approved",
  "social.week_lapsed",
  "social.attention.staff",
  "account.closure",
  "account.monthly_report",
  "account.security_alert.staff",
] as const;

const DASHES = /[–—]/;

describe("the event registry", () => {
  it("has every event in the target matrix, and nothing else", () => {
    expect([...NOTIFICATION_EVENT_KEYS].sort()).toEqual([...MATRIX_EVENTS].sort());
  });

  it("keys every definition by its own key", () => {
    for (const key of NOTIFICATION_EVENT_KEYS) expect(NOTIFICATION_EVENTS[key].key).toBe(key);
  });

  it("recognises a key and refuses anything else", () => {
    expect(isNotificationEventKey("kickoff.booked")).toBe(true);
    expect(isNotificationEventKey("kickoff.nothing")).toBe(false);
  });

  it("only gives an event a topic the settings screen knows", () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const { topic } = eventDefinition(key);
      if (topic !== null) expect(NOTIFICATION_TOPICS).toContain(topic);
    }
  });

  it("makes an event with no topic mandatory: there is nothing to switch it off with", () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const definition = eventDefinition(key);
      if (definition.audience === "customer" && definition.topic === null) expect(definition.mandatory, key).toBe(true);
    }
  });

  it("keeps staff events always on", () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const definition = eventDefinition(key);
      if (definition.audience === "staff") expect(definition.mandatory, key).toBe(true);
    }
  });

  it("makes the four owner answers mandatory and the optional ones optional (owner, 2026-11-16)", () => {
    for (const key of ["billing.payment_failed", "billing.plan_lapsed", "billing.refund", "account.closure"] as const) {
      expect(eventDefinition(key).mandatory, key).toBe(true);
    }
    for (const key of ["website.preview_ready", "request.received", "request.reply", "account.monthly_report", "social.post_failed", "kickoff.soon"] as const) {
      expect(eventDefinition(key).mandatory, key).toBe(false);
    }
  });

  it("puts the call reminder and social events under their own topics", () => {
    expect(eventDefinition("kickoff.soon").topic).toBe("calls");
    expect(eventDefinition("social.post_failed").topic).toBe("social");
    expect(eventDefinition("website.preview_ready").topic).toBe("needs_approval");
  });

  it("lists a settings line for every mandatory customer event that is not a one off", () => {
    for (const line of ALWAYS_SENT_LINES) expect(line).not.toMatch(DASHES);
    expect(ALWAYS_SENT_LINES.length).toBeGreaterThan(0);
  });
});

describe("the kickoff wording", () => {
  it("uses the approved and draft lines from the matrix", () => {
    expect(bellCopyFor("kickoff.booked", { when: "Tue 11:00" })?.title).toBe("Your kickoff call is booked for Tue 11:00");
    expect(bellCopyFor("kickoff.soon", { when: "11:00" })?.title).toBe("Your kickoff call starts at 11:00");
    expect(bellCopyFor("kickoff.completed", {})?.title).toBe("Thanks for the call. We are getting your website started");
    expect(bellCopyFor("kickoff.not_joined", { when: "11:00" })?.title).toBe("We missed each other on 11:00. Pick a new time");
    expect(bellCopyFor("kickoff.reschedule", {})?.title).toBe("We need a new time for your kickoff call. Pick one here");
    expect(bellCopyFor("kickoff.fallback_started", {})?.title).toBe("We started your website");
    expect(bellCopyFor("kickoff.ended", { businessName: "Asha Cafe" })?.title).toBe("Did the kickoff call with Asha Cafe happen?");
    expect(bellCopyFor("kickoff.fallback_started.staff", { businessName: "Asha Cafe" })?.title).toBe("Started without call confirmation");
  });

  it("words a call changed on Cal.com for staff", () => {
    expect(bellCopyFor("call.changed.staff", { what: "moved", when: "Tue 11:00" })).toEqual({ title: "A call was moved on Cal.com", body: "Tue 11:00", link: "/calls" });
    expect(eventDefinition("call.changed.staff").channels).toEqual(["teams", "bell"]);
  });

  it("never shows customers the staff wording", () => {
    expect(bellCopyFor("kickoff.fallback_started", {})?.title).not.toMatch(/confirmation/i);
    expect(emailCopyFor("kickoff.fallback_started", {})?.subject ?? "").not.toMatch(/confirmation/i);
  });

  it("carries the same line into the email and the push", () => {
    expect(emailCopyFor("kickoff.soon", { when: "11:00" })).toMatchObject({ subject: "Your kickoff call starts at 11:00", button: { label: "Join here", link: "/help" } });
    expect(pushCopyFor("kickoff.soon", { when: "11:00" })).toMatchObject({ title: "Your kickoff call starts at 11:00", link: "/help" });
    expect(emailCopyFor("kickoff.completed", {})?.paragraphs).toEqual(["Thanks for the call. We are getting your website started"]);
  });
});

describe("the copy modules", () => {
  it("gives a push a tag that collapses repeats and no more than a short line", () => {
    const push = pushCopyFor("kickoff.soon", { when: "11:00" });
    expect(push?.tag).toBe("kickoff.soon");
    expect((push?.body ?? "").length).toBeLessThanOrEqual(120);
  });

  it("returns null, not invented words, for an event with no wording yet", () => {
    expect(bellCopyFor("billing.renewal_upcoming", {})).toBeNull();
    expect(EVENTS_WITHOUT_WORDING).toContain("billing.renewal_upcoming");
  });

  it("has wording on every channel an event lists, or names the event as waiting for wording", () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const { channels } = eventDefinition(key);
      const sample = {} as never;
      const missing: string[] = [];
      if (channels.includes("bell") && bellCopyFor(key, sample) === null) missing.push("bell");
      if (channels.includes("email") && emailCopyFor(key, sample) === null) missing.push("email");
      if (channels.includes("push") && pushCopyFor(key, sample) === null) missing.push("push");
      if (missing.length > 0) expect(EVENTS_WITHOUT_WORDING, `${key} lacks ${missing.join(", ")}`).toContain(key);
    }
  });

  it("writes no em or en dashes in any line", () => {
    const sample = { when: "11:00", businessName: "Asha Cafe" } as never;
    for (const key of NOTIFICATION_EVENT_KEYS) {
      for (const copy of [bellCopyFor(key, sample), emailCopyFor(key, sample), pushCopyFor(key, sample)]) {
        expect(JSON.stringify(copy ?? {}), key).not.toMatch(DASHES);
      }
    }
  });

  it("keeps every link inside the app", () => {
    const sample = { when: "11:00", businessName: "Asha Cafe" } as never;
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const links = [bellCopyFor(key, sample)?.link, emailCopyFor(key, sample)?.button?.link, pushCopyFor(key, sample)?.link];
      for (const link of links) if (link !== undefined && link !== null) expect(link).toMatch(/^\/($|[^/])/);
    }
  });
});
