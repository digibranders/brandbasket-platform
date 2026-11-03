import { describe, expect, it } from "vitest";
import { isOpenAuthRoute } from "./auth-routes";

describe("isOpenAuthRoute", () => {
  it("opens sign-in, the session read and sign-out, with their own methods", () => {
    expect(isOpenAuthRoute("POST", "/api/auth/sign-in/email")).toBe(true);
    expect(isOpenAuthRoute("GET", "/api/auth/get-session")).toBe(true);
    expect(isOpenAuthRoute("post", "/api/auth/sign-out/")).toBe(true);
  });

  it("keeps every other route closed", () => {
    for (const path of ["/api/auth/sign-up/email", "/api/auth/update-user", "/api/auth/change-password", "/api/auth/request-password-reset", "/api/auth/list-sessions"]) {
      expect(isOpenAuthRoute("POST", path)).toBe(false);
    }
  });

  it("refuses the wrong method", () => {
    expect(isOpenAuthRoute("GET", "/api/auth/sign-in/email")).toBe(false);
    expect(isOpenAuthRoute("POST", "/api/auth/get-session")).toBe(false);
  });
});
