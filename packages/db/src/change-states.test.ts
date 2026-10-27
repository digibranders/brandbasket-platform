import { describe, expect, it } from "vitest";
import { CHANGE_MOVES, CHANGE_STATES, canMoveChange, isChangeKind, isChangeState, isEnded } from "./change-states";

describe("change request states", () => {
  it("has nine states and an entry in the move table for each", () => {
    expect(CHANGE_STATES).toHaveLength(9);
    expect(Object.keys(CHANGE_MOVES).sort()).toEqual([...CHANGE_STATES].sort());
  });

  it("only names real states as targets, and never lists a state as its own target", () => {
    for (const from of CHANGE_STATES) {
      for (const to of CHANGE_MOVES[from]) {
        expect(CHANGE_STATES).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });

  it("follows the life the customer sees", () => {
    expect(canMoveChange("requested", "quoted")).toBe(true);
    expect(canMoveChange("quoted", "in_progress")).toBe(true);
    expect(canMoveChange("in_progress", "preview")).toBe(true);
    expect(canMoveChange("preview", "approved")).toBe(true);
    expect(canMoveChange("preview", "revisions")).toBe(true);
    expect(canMoveChange("revisions", "preview")).toBe(true);
    expect(canMoveChange("approved", "shipped")).toBe(true);
  });

  it("does not skip steps backwards or forwards", () => {
    expect(canMoveChange("requested", "preview")).toBe(false);
    expect(canMoveChange("shipped", "in_progress")).toBe(false);
    expect(canMoveChange("quoted", "requested")).toBe(false);
    expect(canMoveChange("preview", "quoted")).toBe(false);
  });

  it("lets a finished change be reopened, and a quote that was turned down come back", () => {
    expect(canMoveChange("shipped", "revisions")).toBe(true);
    expect(canMoveChange("approved", "revisions")).toBe(true);
    expect(canMoveChange("withdrawn", "quoted")).toBe(true);
  });

  it("closes a declined request for good", () => {
    expect(CHANGE_MOVES.declined).toEqual([]);
  });

  it("treats staying put as allowed, so re-quoting a quote is not a move", () => {
    expect(canMoveChange("quoted", "quoted")).toBe(true);
  });

  it("knows which states end the work", () => {
    expect(CHANGE_STATES.filter(isEnded)).toEqual(["approved", "shipped", "declined", "withdrawn"]);
  });

  it("recognises states and kinds and nothing else", () => {
    expect(isChangeState("preview")).toBe(true);
    expect(isChangeState("Preview")).toBe(false);
    expect(isChangeState(7)).toBe(false);
    expect(isChangeKind("social")).toBe(true);
    expect(isChangeKind("website_change")).toBe(false);
  });
});
