import { CHANGE_MOVES, CHANGE_STATES, canMoveChange } from "@brandbasket/db/change-states";
import { describe, expect, it } from "vitest";
import { coverageLabel, staffControls, stateLabel } from "@/lib/request-controls";

const request = (state: (typeof CHANGE_STATES)[number], overrides: { kind?: "website" | "billing"; accepted?: boolean } = {}) => ({ state, kind: overrides.kind ?? "website", accepted: overrides.accepted ?? false });

describe("staffControls", () => {
  it("offers a new request a quote, an included edit, no charge, or a decline", () => {
    expect(staffControls(request("requested"), 2)).toEqual({ quote: true, includedEdit: true, noCharge: true, sendForChecking: false, markDone: false, decline: true });
  });

  it("offers an included edit only for a website change with one left", () => {
    expect(staffControls(request("requested"), 0).includedEdit).toBe(false);
    expect(staffControls(request("requested", { kind: "billing" }), 2).includedEdit).toBe(false);
    expect(staffControls(request("requested", { kind: "billing" }), 2).noCharge).toBe(true);
  });

  it("lets a quote be replaced, and turned into free work only until the customer has accepted it", () => {
    expect(staffControls(request("quoted"), 2)).toMatchObject({ quote: true, includedEdit: true, noCharge: true, decline: true });
    expect(staffControls(request("quoted", { accepted: true }), 2)).toMatchObject({ quote: true, includedEdit: false, noCharge: false, decline: true });
  });

  it("moves work that has started along: for checking, done, declined", () => {
    expect(staffControls(request("in_progress"), 2)).toEqual({ quote: false, includedEdit: false, noCharge: false, sendForChecking: true, markDone: true, decline: true });
    expect(staffControls(request("revisions"), 2)).toMatchObject({ sendForChecking: true, markDone: true });
    expect(staffControls(request("preview"), 2)).toMatchObject({ sendForChecking: false, markDone: true, decline: true });
    expect(staffControls(request("approved"), 2)).toMatchObject({ markDone: true, decline: false });
  });

  it("offers nothing on a request that is over", () => {
    for (const state of ["shipped", "declined", "withdrawn"] as const) {
      expect(Object.values(staffControls(request(state), 2)).some(Boolean), state).toBe(false);
    }
  });

  it("only offers moves the database allows", () => {
    for (const state of CHANGE_STATES) {
      const controls = staffControls(request(state), 2);
      if (controls.sendForChecking) expect(canMoveChange(state, "preview"), `${state} to preview`).toBe(true);
      if (controls.markDone) expect(canMoveChange(state, "shipped"), `${state} to done`).toBe(true);
      if (controls.decline) expect(canMoveChange(state, "declined"), `${state} to declined`).toBe(true);
      if (controls.includedEdit || controls.noCharge) expect(canMoveChange(state, "in_progress"), `${state} to in progress`).toBe(true);
      if (controls.quote) expect(canMoveChange(state, "quoted"), `${state} to quoted`).toBe(true);
    }
    expect(CHANGE_MOVES.declined).toEqual([]);
  });
});

describe("labels", () => {
  it("says what the team sees and what the customer sees", () => {
    expect(stateLabel("quoted")).toBe("Quote sent (customer sees: Quoted)");
    expect(stateLabel("revisions")).toBe("Fix asked (customer sees: In progress)");
    expect(stateLabel("withdrawn")).toBe("Quote turned down (customer sees: Closed)");
  });

  it("names how each request is covered", () => {
    expect(["undecided", "included", "free", "paid"].map((value) => coverageLabel(value as never))).toEqual(["Not decided", "Included edit", "No charge", "Paid quote"]);
  });
});
