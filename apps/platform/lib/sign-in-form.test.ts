import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialSignInState, type SignInFormState } from "@fynix/shared/lib/sign-in-form";
import { SignInForm } from "@fynix/shared/ui/panel/sign-in-form";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: vi.fn(),
}));

const NOTICE = "Your password is changed. Sign in with the new one.";
const ERROR = "That number and password don't match an account.";

async function failedSignIn(_state: SignInFormState, data: FormData): Promise<SignInFormState> {
  const identifier = data.get("identifier") ?? data.get("email");
  return { status: "error", message: ERROR, email: typeof identifier === "string" ? identifier : "" };
}

function renderForm(state: SignInFormState, identifier: "email" | "phone-or-email", notice?: string, pending = false): string {
  vi.mocked(useActionState).mockReturnValue([state, vi.fn(), pending]);
  return renderToStaticMarkup(createElement(SignInForm, {
    action: failedSignIn,
    turnstileAction: "sign_in",
    submitLabel: "Sign in",
    identifier,
    notice,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignInForm agreement note", () => {
  function renderWithNote(note?: string): string {
    vi.mocked(useActionState).mockReturnValue([initialSignInState, vi.fn(), false]);
    return renderToStaticMarkup(createElement(SignInForm, {
      action: failedSignIn,
      turnstileAction: "sign_in",
      submitLabel: "Sign in",
      identifier: "phone-or-email",
      agreementNote: note === undefined ? undefined : createElement("span", null, note),
    }));
  }

  it("shows the page's note straight under the sign-in button", () => {
    const html = renderWithNote("By signing in you agree to the Terms.");
    expect(html).toContain("By signing in you agree to the Terms.");
    expect(html.indexOf("Sign in")).toBeLessThan(html.indexOf("By signing in you agree"));
  });

  it("shows nothing under the button when the page gives no note, as on the staff console", () => {
    expect(renderWithNote()).not.toContain("By signing in");
  });
});

describe("SignInForm notice", () => {
  it("uses username autocomplete for the staff email identifier", () => {
    const rendered = renderForm(initialSignInState, "email");
    expect(rendered).toContain('type="email"');
    expect(rendered).toContain('autoComplete="username"');
  });
  it.each(["email", "phone-or-email"] as const)("hides the notice after a failed %s sign-in", async (identifier) => {
    const initial = renderForm(initialSignInState, identifier, NOTICE);
    expect(initial).toContain('role="status"');
    expect(initial).toContain(NOTICE);
    expect(initial).not.toContain('role="alert"');

    const data = new FormData();
    data.set(identifier === "email" ? "email" : "identifier", "owner@example.com");
    data.set("password", "wrong-password");
    const result = await failedSignIn(initialSignInState, data);
    const failed = renderForm(result, identifier, NOTICE);

    expect(failed).not.toContain(NOTICE);
    expect(failed).not.toContain('role="status"');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(ERROR.replaceAll("'", "&#x27;"));
    expect(renderForm(result, identifier, NOTICE, true)).not.toContain(NOTICE);
  });

  it("renders no status banner when the page supplies no notice", () => {
    expect(renderForm(initialSignInState, "email")).not.toContain('role="status"');
  });
});
