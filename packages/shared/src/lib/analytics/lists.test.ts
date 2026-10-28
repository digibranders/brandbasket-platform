import { HIT_CHANNELS, HIT_DEVICES, HIT_KINDS as DB_HIT_KINDS } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { CHANNELS } from "./classify-channel";
import { DEVICES } from "./device";
import { HIT_KINDS } from "./payload";

/** The tracking script cannot import the database package, so the lists exist twice. These fail if they drift. */
describe("the lists the rules share with the database", () => {
  it("agree on event kinds, channels and devices", () => {
    expect([...HIT_KINDS]).toEqual([...DB_HIT_KINDS]);
    expect([...CHANNELS]).toEqual([...HIT_CHANNELS]);
    expect([...DEVICES]).toEqual([...HIT_DEVICES]);
  });
});
