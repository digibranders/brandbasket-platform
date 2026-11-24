import { describe, expect, it } from "vitest";
import { connectModesOf, requestWords } from "./requests";

describe("connectModesOf", () => {
  it("puts the networks on the list on links and leaves the rest on the button", () => {
    expect(connectModesOf("instagram, Facebook")).toEqual({ instagram: "request", facebook: "request" });
    expect(connectModesOf("instagram")).toEqual({ instagram: "request" });
  });

  it("means the button everywhere when nothing is set, and ignores networks that have no link step", () => {
    expect(connectModesOf(undefined)).toEqual({});
    expect(connectModesOf("")).toEqual({});
    expect(connectModesOf("linkedin,google,tiktok")).toEqual({});
  });
});

describe("requestWords", () => {
  const base = { network: "instagram", url: "https://instagram.com/acme_foods", handle: "acme_foods", reason: null } as const;

  it("tells her we are reviewing her profile", () => {
    expect(requestWords({ ...base, state: "requested" })).toEqual({ short: "Reviewing your profile", long: "We are reviewing @acme_foods so you can keep using Instagram. We will tell you here as soon as it is your turn." });
  });

  it("tells her to accept the invite and press Allow once invited", () => {
    expect(requestWords({ ...base, state: "invited" }).long).toBe("We added you. Accept the invite in Instagram, then press Allow Instagram here.");
  });

  it("gives the team's reason when it could not set the account up", () => {
    expect(requestWords({ ...base, state: "refused", reason: "This is a personal account." }).long).toBe("This is a personal account.");
    expect(requestWords({ ...base, network: "facebook", handle: "", state: "refused" }).long).toBe("We could not set up your account. Check the link and send it again.");
  });
});
