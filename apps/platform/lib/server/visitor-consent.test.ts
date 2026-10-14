import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordConsent, type Database } from "@fynix/db";
import { recordContributionConsent } from "./visitor-consent";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({ recordConsent: vi.fn() }));

const DB = {} as Database;
const VISITOR = "01939c54-1111-7222-8333-444455556666";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordConsent).mockResolvedValue(undefined);
});

describe("recordContributionConsent", () => {
  it("keeps what the visitor agreed to and that they said they are 18 or over, each with the notice version they saw", async () => {
    await recordContributionConsent(DB, VISITOR, { noticeVersion: "pre-dpdp", adult: true });
    expect(recordConsent).toHaveBeenCalledTimes(2);
    expect(recordConsent).toHaveBeenCalledWith(DB, { subject: { type: "visitor", ref: VISITOR }, purpose: "directory_contribution", noticeVersion: "pre-dpdp", channel: "web" });
    expect(recordConsent).toHaveBeenCalledWith(DB, { subject: { type: "visitor", ref: VISITOR }, purpose: "adult_declaration", noticeVersion: "pre-dpdp", channel: "web" });
  });

  it("records no declaration of age when the box was not ticked", async () => {
    await recordContributionConsent(DB, VISITOR, { noticeVersion: "pre-dpdp", adult: false });
    expect(recordConsent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordConsent).mock.calls[0]?.[1]).toMatchObject({ purpose: "directory_contribution" });
  });

  it("records nothing for a post made without the notice version, as from a site that does not send it yet", async () => {
    await recordContributionConsent(DB, VISITOR, undefined);
    await recordContributionConsent(DB, VISITOR, null);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("logs and carries on when the record cannot be written, so a published post is not undone", async () => {
    vi.mocked(recordConsent).mockRejectedValue(new Error("connection reset"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordContributionConsent(DB, VISITOR, { noticeVersion: "pre-dpdp", adult: true })).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("consent record"), expect.anything());
    logged.mockRestore();
  });
});
