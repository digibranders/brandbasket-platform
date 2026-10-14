import { describe, expect, it } from "vitest";
import { loginNotice } from "./login-notice";

describe("loginNotice", () => {
  it.each(["__proto__", "constructor", "toString", "unknown", undefined, ["password-changed", "password-changed"]])("ignores unrecognized or repeated notices: %s", (notice) => {
    expect(loginNotice(notice)).toBeUndefined();
  });
  it("selects only fixed own messages", () => {
    expect(loginNotice("password-changed")).toBe("Your password is changed. Sign in with the new one.");
    expect(loginNotice("account-closed")).toContain("Your account is closed.");
  });
});
