import { describe, expect, it } from "vitest";
import { peopleNoticeHref, PEOPLE_NOTICES, readPeopleNotice } from "./people-notices";

const ID = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

describe("people notices", () => {
  it("reads a known notice and nothing else", () => {
    expect(readPeopleNotice("renamed")).toBe("renamed");
    expect(readPeopleNotice(["restored"])).toBeNull();
    expect(readPeopleNotice("nonsense")).toBeNull();
    expect(readPeopleNotice(undefined)).toBeNull();
  });

  it("links back to the People tab", () => {
    expect(peopleNoticeHref(ID, "extended")).toBe(`/clients/${ID}/people?people=extended`);
  });

  it("says every outcome in words", () => {
    expect(PEOPLE_NOTICES.renamed.ok).toBe(true);
    expect(PEOPLE_NOTICES["no-closure"].ok).toBe(false);
  });
});
