import { describe, expect, it } from "vitest";
import {
  answerByAsked,
  directoryLookupOf,
  directoryRefId,
  sameDirectoryBusiness,
  type DirectoryRef,
  type ResolvedDirectoryAsk,
} from "./queries/directory-refs";

const SMILE = "k7m2q9a";
const GLOW = "b3cdefg";
const SMILE_KEY = "dentists/thane/naupada/smile-dental";
const SMILE_OLD_KEY = "dentists/thane/naupada/smile-dental-clinic";
const GYM_KEY = "gyms/thane/majiwada/iron-house";

describe("directoryRefId", () => {
  it("reads a placed business under its id and an unplaced key under itself", () => {
    expect(directoryRefId({ placeId: SMILE, listingKey: SMILE_KEY })).toBe(SMILE);
    expect(directoryRefId({ placeId: SMILE, listingKey: null })).toBe(SMILE);
    expect(directoryRefId({ placeId: null, listingKey: GYM_KEY })).toBe(GYM_KEY);
  });
});

describe("directoryLookupOf", () => {
  it("splits businesses into distinct place ids and the keys no place has", () => {
    const refs: DirectoryRef[] = [
      { placeId: SMILE, listingKey: SMILE_KEY },
      { placeId: SMILE, listingKey: SMILE_OLD_KEY },
      { placeId: GLOW, listingKey: null },
      { placeId: null, listingKey: GYM_KEY },
      { placeId: null, listingKey: GYM_KEY },
    ];
    expect(directoryLookupOf(refs)).toEqual({ placeIds: [SMILE, GLOW], unplacedKeys: [GYM_KEY] });
    expect(directoryLookupOf([])).toEqual({ placeIds: [], unplacedKeys: [] });
  });
});

describe("answerByAsked", () => {
  it("gives each asked id or key the answer read under its business, and leaves out what had none", () => {
    const resolved: ResolvedDirectoryAsk = {
      lookup: { placeIds: [SMILE, GLOW], unplacedKeys: [GYM_KEY] },
      readAs: new Map([
        [SMILE_KEY, SMILE],
        [SMILE_OLD_KEY, SMILE],
        [GLOW, GLOW],
        [GYM_KEY, GYM_KEY],
      ]),
    };
    const results = new Map([
      [SMILE, 4.5],
      [GYM_KEY, 3],
    ]);
    expect(answerByAsked(resolved, results)).toEqual(
      new Map([
        [SMILE_KEY, 4.5],
        [SMILE_OLD_KEY, 4.5],
        [GYM_KEY, 3],
      ]),
    );
  });
});

describe("sameDirectoryBusiness", () => {
  it.each([
    [{ placeId: SMILE, listingKey: SMILE_KEY }, { placeId: SMILE, listingKey: SMILE_OLD_KEY }, true],
    [{ placeId: SMILE, listingKey: SMILE_KEY }, { placeId: GLOW, listingKey: SMILE_KEY }, false],
    [{ placeId: null, listingKey: GYM_KEY }, { placeId: null, listingKey: GYM_KEY }, true],
    [{ placeId: null, listingKey: GYM_KEY }, { placeId: null, listingKey: SMILE_KEY }, false],
    // One placed and one not: the backfill gives both rows a place together, so they are not known to be the same.
    [{ placeId: SMILE, listingKey: SMILE_KEY }, { placeId: null, listingKey: SMILE_KEY }, false],
  ])("compares %j with %j as %s", (a, b, same) => {
    expect(sameDirectoryBusiness(a, b)).toBe(same);
    expect(sameDirectoryBusiness(b, a)).toBe(same);
  });
});
