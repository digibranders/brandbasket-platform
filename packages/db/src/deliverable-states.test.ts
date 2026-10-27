import { describe, expect, it } from "vitest";
import { DELIVERABLE_KINDS, DELIVERABLE_STATUSES, canMoveDeliverable, isDeliverableKind, isDeliverableStatus, serviceOfKind } from "./deliverable-states";

describe("deliverable states", () => {
  it("has three kinds and four states", () => {
    expect(DELIVERABLE_KINDS).toEqual(["post", "page", "listing"]);
    expect(DELIVERABLE_STATUSES).toEqual(["planned", "awaiting_approval", "approved", "published"]);
  });

  it("gives each kind its service", () => {
    expect(serviceOfKind("post")).toBe("social");
    expect(serviceOfKind("page")).toBe("search");
    expect(serviceOfKind("listing")).toBe("search");
  });

  it("takes a post through approval and never around it", () => {
    expect(canMoveDeliverable("post", "planned", "awaiting_approval")).toBe(true);
    expect(canMoveDeliverable("post", "awaiting_approval", "approved")).toBe(true);
    expect(canMoveDeliverable("post", "approved", "published")).toBe(true);
    expect(canMoveDeliverable("post", "planned", "published")).toBe(false);
    expect(canMoveDeliverable("post", "awaiting_approval", "published")).toBe(false);
  });

  it("lets staff pull a post back, even after approval", () => {
    expect(canMoveDeliverable("post", "awaiting_approval", "planned")).toBe(true);
    expect(canMoveDeliverable("post", "approved", "awaiting_approval")).toBe(true);
  });

  it("has no approval for a page or a listing", () => {
    for (const kind of ["page", "listing"] as const) {
      expect(canMoveDeliverable(kind, "planned", "published")).toBe(true);
      expect(canMoveDeliverable(kind, "planned", "awaiting_approval")).toBe(false);
      expect(canMoveDeliverable(kind, "planned", "approved")).toBe(false);
    }
  });

  it("closes a published item for good and treats staying put as allowed", () => {
    for (const kind of DELIVERABLE_KINDS) {
      for (const to of DELIVERABLE_STATUSES) expect(canMoveDeliverable(kind, "published", to)).toBe(to === "published");
      expect(canMoveDeliverable(kind, "planned", "planned")).toBe(true);
    }
  });

  it("recognises kinds and states and nothing else", () => {
    expect(isDeliverableKind("post")).toBe(true);
    expect(isDeliverableKind("report")).toBe(false);
    expect(isDeliverableStatus("approved")).toBe(true);
    expect(isDeliverableStatus("Approved")).toBe(false);
    expect(isDeliverableStatus(3)).toBe(false);
  });
});
