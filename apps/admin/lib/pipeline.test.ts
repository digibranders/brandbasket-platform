import type { AddOnToContact, ClientSummary, Lead, LeadStatus, ProjectStatus } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  attentionBySubject,
  attentionItems,
  clientStage,
  isLeadInPipeline,
  journeySubjects,
  lateReason,
  type AttentionInput,
} from "./pipeline";

const NOW = new Date("2026-09-25T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function project(status: ProjectStatus): NonNullable<ClientSummary["project"]> {
  return {
    id: `project-${status}`,
    status,
    onboardingSubmittedAt: null,
    slaDueAt: null,
    previewUrl: null,
    previewSentAt: null,
    revisionRoundsGranted: 0,
    launchedAt: null,
    createdAt: NOW,
  };
}

function client(id: string, status: ProjectStatus | null, createdAt = NOW): ClientSummary {
  return {
    businessId: id,
    businessName: `Business ${id}`,
    currency: "USD",
    tier: "premium",
    createdAt,
    owner: null,
    project: status === null ? null : project(status),
    billing: { subscription: null, firstPayment: null },
  };
}

function lead(id: string, status: LeadStatus, createdAt = NOW): Lead {
  return {
    id,
    name: `Contact ${id}`,
    businessName: `Lead ${id}`,
    email: `${id}@example.com`,
    phone: "+15125550142",
    businessType: null,
    currency: "USD",
    message: null,
    status,
    notes: null,
    businessId: null,
    attachedByStaffId: null,
    attachedAt: null,
    createdAt,
  };
}

function noAttention(): AttentionInput {
  return { flagged: [], addOns: [], waiting: [], newLeads: [], now: NOW };
}

describe("clientStage", () => {
  it.each<[ProjectStatus | null, string]>([
    [null, "setup"],
    ["onboarding", "setup"],
    ["submitted", "building"],
    ["building", "building"],
    ["preview", "preview"],
    ["revisions", "preview"],
    ["approved", "preview"],
    ["live", "live"],
    ["on_hold", "paused"],
    ["cancelled", "paused"],
  ])("puts a %s project in %s", (status, stage) => {
    expect(clientStage(client("a", status))).toBe(stage);
  });
});

describe("isLeadInPipeline", () => {
  it.each<[LeadStatus, boolean]>([
    ["new", true],
    ["call_booked", true],
    ["call_done", true],
    ["agreed", true],
    ["invite_sent", true],
    ["account_created", true],
    ["paid", false],
    ["lost", false],
  ])("treats a %s lead as in the pipeline: %s", (status, expected) => {
    expect(isLeadInPipeline({ status })).toBe(expected);
  });
});

describe("attentionItems", () => {
  it("is empty when nothing needs us", () => {
    expect(attentionItems(noAttention())).toEqual([]);
  });

  it("orders money first, then late previews, then due previews, then new leads", () => {
    const items = attentionItems({
      now: NOW,
      addOns: [],
      flagged: [
        { paymentId: "p1", businessId: "nila", businessName: "Nila Tailors", reason: "amount_mismatch", raisedAt: NOW },
      ],
      waiting: [
        { client: client("kettle", "building"), dueAt: new Date(NOW.getTime() + 2 * DAY), overdue: false },
        { client: client("oak", "building"), dueAt: new Date(NOW.getTime() - 2 * DAY), overdue: true },
      ],
      newLeads: [lead("old", "new", new Date(NOW.getTime() - 3 * DAY)), lead("fresh", "new")],
    });
    expect(items.map((item) => [item.kind, item.subjectId])).toEqual([
      ["payment", "nila"],
      ["overdue", "oak"],
      ["due", "kettle"],
      ["new-lead", "fresh"],
      ["new-lead", "old"],
    ]);
  });

  it("says how many days a preview is late", () => {
    const [item] = attentionItems({
      ...noAttention(),
      waiting: [{ client: client("oak", "building"), dueAt: new Date(NOW.getTime() - 2 * DAY - 1000), overdue: true }],
    });
    expect(item?.reason).toBe("Preview 2 days late");
  });

  it("uses the singular for one day and plain words under a day", () => {
    const [oneDay] = attentionItems({
      ...noAttention(),
      waiting: [{ client: client("a", "building"), dueAt: new Date(NOW.getTime() - DAY - 1000), overdue: true }],
    });
    const [justNow] = attentionItems({
      ...noAttention(),
      waiting: [{ client: client("b", "building"), dueAt: new Date(NOW.getTime() - 1000), overdue: true }],
    });
    expect(oneDay?.reason).toBe("Preview 1 day late");
    expect(justNow?.reason).toBe("Preview overdue");
  });

  it("leaves out waiting clients with no deadline", () => {
    const items = attentionItems({
      ...noAttention(),
      waiting: [{ client: client("a", "submitted"), dueAt: null, overdue: false }],
    });
    expect(items).toEqual([]);
  });

  it("lists a business twice when it has a payment to sort and a late preview", () => {
    const items = attentionItems({
      now: NOW,
      addOns: [],
      flagged: [{ paymentId: "p1", businessId: "oak", businessName: "Oak", reason: "already_paid", raisedAt: NOW }],
      waiting: [{ client: client("oak", "building"), dueAt: new Date(NOW.getTime() - DAY - 1), overdue: true }],
      newLeads: [],
    });
    expect(items.map((item) => item.kind)).toEqual(["payment", "overdue"]);
  });

  it("links each item to the right page", () => {
    const items = attentionItems({
      now: NOW,
      addOns: [],
      flagged: [{ paymentId: "p1", businessId: "nila", businessName: "Nila", reason: "already_paid", raisedAt: NOW }],
      waiting: [],
      newLeads: [lead("l1", "new")],
    });
    expect(items.map((item) => item.href)).toEqual(["/clients/nila", "/leads/l1"]);
  });
});

function toContact(overrides: Partial<AddOnToContact> & Pick<AddOnToContact, "id" | "businessId">): AddOnToContact {
  return { kind: "subscription", businessName: `Business ${overrides.businessId}`, addOn: "social-media", at: NOW, ...overrides };
}

describe("add-on purchases in attentionItems", () => {
  it("says what to set up, in plain words, for each kind of purchase", () => {
    const items = attentionItems({
      ...noAttention(),
      addOns: [
        toContact({ id: "s1", businessId: "oak", addOn: "social-media", at: new Date(NOW.getTime() - 3 * DAY) }),
        toContact({ id: "s2", businessId: "kettle", addOn: "advertising", at: new Date(NOW.getTime() - 2 * DAY) }),
        toContact({ id: "r1", businessId: "nila", kind: "press-release", addOn: "press-release", at: new Date(NOW.getTime() - DAY) }),
      ],
    });
    expect(items.map((item) => item.reason)).toEqual([
      "New add-on to set up: Social media",
      "New add-on to set up: Paid advertising",
      "Press release to start",
    ]);
  });

  it("links to the client's Add-ons section and names the business", () => {
    const [item] = attentionItems({ ...noAttention(), addOns: [toContact({ id: "s1", businessId: "oak", businessName: "Oak Cafe" })] });
    expect(item).toMatchObject({ kind: "add-on", key: "add-on:subscription:s1", subjectId: "oak", href: "/clients/oak#add-ons", name: "Oak Cafe", at: NOW });
  });

  it("comes after money and before previews and leads, oldest purchase first", () => {
    const items = attentionItems({
      now: NOW,
      flagged: [{ paymentId: "p1", businessId: "nila", businessName: "Nila", reason: "already_paid", raisedAt: NOW }],
      addOns: [
        toContact({ id: "newer", businessId: "b-newer", at: new Date(NOW.getTime() - DAY) }),
        toContact({ id: "older", businessId: "b-older", at: new Date(NOW.getTime() - 3 * DAY) }),
      ],
      waiting: [{ client: client("oak", "building"), dueAt: new Date(NOW.getTime() - 2 * DAY), overdue: true }],
      newLeads: [lead("fresh", "new")],
    });
    expect(items.map((item) => [item.kind, item.subjectId])).toEqual([
      ["payment", "nila"],
      ["add-on", "b-older"],
      ["add-on", "b-newer"],
      ["overdue", "oak"],
      ["new-lead", "fresh"],
    ]);
  });

  it("keeps two purchases by the same business apart, and a payment still wins the business's ring", () => {
    const items = attentionItems({
      now: NOW,
      flagged: [{ paymentId: "p1", businessId: "oak", businessName: "Oak", reason: "already_paid", raisedAt: NOW }],
      addOns: [toContact({ id: "s1", businessId: "oak" }), toContact({ id: "r1", businessId: "oak", kind: "press-release", addOn: "press-release" })],
      waiting: [],
      newLeads: [],
    });
    expect(new Set(items.map((item) => item.key)).size).toBe(3);
    expect(attentionBySubject(items).get("oak")?.kind).toBe("payment");
  });

  it("puts a client with a purchase to set up ahead of the others in their stage", () => {
    const items = attentionItems({ ...noAttention(), addOns: [toContact({ id: "s1", businessId: "b" })] });
    const journey = journeySubjects(
      [client("a", "live", NOW), client("b", "live", new Date(NOW.getTime() - 9 * DAY))],
      [],
      attentionBySubject(items),
    );
    expect(journey.byStage.live.map((subject) => subject.id)).toEqual(["b", "a"]);
  });

  it("never uses a dash in what it says", () => {
    const items = attentionItems({
      ...noAttention(),
      addOns: [toContact({ id: "s1", businessId: "a" }), toContact({ id: "r1", businessId: "b", kind: "press-release", addOn: "press-release" })],
    });
    for (const item of items) expect(item.reason).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("attentionBySubject", () => {
  it("keeps the most urgent item for each business or lead", () => {
    const items = attentionItems({
      now: NOW,
      addOns: [],
      flagged: [{ paymentId: "p1", businessId: "oak", businessName: "Oak", reason: "already_paid", raisedAt: NOW }],
      waiting: [{ client: client("oak", "building"), dueAt: new Date(NOW.getTime() - 2 * DAY), overdue: true }],
      newLeads: [],
    });
    expect(attentionBySubject(items).get("oak")?.kind).toBe("payment");
  });
});

describe("journeySubjects", () => {
  it("places clients and pipeline leads in their stages and counts the paused", () => {
    const journey = journeySubjects(
      [client("a", "onboarding"), client("b", "building"), client("c", "live"), client("d", "on_hold"), client("e", null)],
      [lead("l1", "new"), lead("l2", "lost"), lead("l3", "paid")],
      new Map(),
    );
    expect(journey.byStage.lead.map((subject) => subject.id)).toEqual(["l1"]);
    expect(journey.byStage.setup.map((subject) => subject.id).sort()).toEqual(["a", "e"]);
    expect(journey.byStage.building.map((subject) => subject.id)).toEqual(["b"]);
    expect(journey.byStage.preview).toEqual([]);
    expect(journey.byStage.live.map((subject) => subject.id)).toEqual(["c"]);
    expect(journey.paused).toBe(1);
  });

  it("draws a sign-up that has not paid yet as a lead: it is not a client until its first payment", () => {
    const journey = journeySubjects([], [lead("l1", "account_created"), lead("l2", "paid")], new Map());
    expect(journey.byStage.lead.map((subject) => subject.id)).toEqual(["l1"]);
    expect(journey.byStage.lead[0]?.statusLabel).toBe("Account created");
  });

  it("puts anyone who needs attention first in their stage, then the newest", () => {
    const older = new Date(NOW.getTime() - 5 * DAY);
    const items = attentionItems({
      ...noAttention(),
      waiting: [{ client: client("late", "building", older), dueAt: new Date(NOW.getTime() - DAY - 1), overdue: true }],
    });
    const journey = journeySubjects(
      [client("new", "building", NOW), client("late", "building", older), client("mid", "building", new Date(NOW.getTime() - DAY))],
      [],
      attentionBySubject(items),
    );
    expect(journey.byStage.building.map((subject) => subject.id)).toEqual(["late", "new", "mid"]);
  });

  it("puts late and money problems ahead of previews that are merely due", () => {
    const items = attentionItems({
      now: NOW,
      addOns: [],
      flagged: [{ paymentId: "p1", businessId: "money", businessName: "Money", reason: "already_paid", raisedAt: NOW }],
      waiting: [
        { client: client("due", "building", NOW), dueAt: new Date(NOW.getTime() + DAY), overdue: false },
        { client: client("late", "building", new Date(NOW.getTime() - 9 * DAY)), dueAt: new Date(NOW.getTime() - 2 * DAY), overdue: true },
      ],
      newLeads: [],
    });
    const journey = journeySubjects(
      [client("due", "building", NOW), client("late", "building", new Date(NOW.getTime() - 9 * DAY)), client("money", "building", new Date(NOW.getTime() - 20 * DAY))],
      [],
      attentionBySubject(items),
    );
    expect(journey.byStage.building.map((subject) => subject.id)).toEqual(["money", "late", "due"]);
  });

  it("links clients and leads to their own pages", () => {
    const journey = journeySubjects([client("a", "live")], [lead("l1", "agreed")], new Map());
    expect(journey.byStage.live[0]?.href).toBe("/clients/a");
    expect(journey.byStage.lead[0]?.href).toBe("/leads/l1");
    expect(journey.byStage.lead[0]?.statusLabel).toBe("Agreed");
  });
});

describe("lateReason", () => {
  it("counts whole days past the promise", () => {
    expect(lateReason(new Date(NOW.getTime() - 3 * DAY - 5), NOW)).toBe("Preview 3 days late");
  });
});
