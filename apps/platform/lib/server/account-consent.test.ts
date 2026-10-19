import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordConsent, type Database } from "@brandbasket/db";
import { LEGAL_TEXT_VERSION } from "@brandbasket/shared/lib/privacy/notice-version";
import { recordAccountTermsConsent } from "./account-consent";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ recordConsent: vi.fn() }));

const DB = {} as Database;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordConsent).mockResolvedValue(undefined);
});

describe("recordAccountTermsConsent", () => {
  it("keeps proof that the new account's owner agreed to the Terms and Privacy Notice, with the version they saw", async () => {
    await recordAccountTermsConsent(DB, "user-1");
    expect(recordConsent).toHaveBeenCalledWith(DB, {
      subject: { type: "user", ref: "user-1" },
      purpose: "account_terms",
      noticeVersion: LEGAL_TEXT_VERSION,
      channel: "web",
    });
  });

  it("logs and carries on when the record cannot be written, so a new account is not turned away", async () => {
    vi.mocked(recordConsent).mockRejectedValue(new Error("connection reset"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordAccountTermsConsent(DB, "user-1")).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("consent record"), expect.anything());
    logged.mockRestore();
  });
});
