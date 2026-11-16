// @vitest-environment happy-dom
import { act, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DROPPED_ACTION_MESSAGE } from "@brandbasket/shared/lib/guard-action";
import { staffSupportDropped, STAFF_SUPPORT_INITIAL_STATE, type StaffSupportActionState } from "./support-admin-state";
import { typedValues, useGuardedFormState } from "./use-guarded-form-state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type State = { readonly status: "idle" } | { readonly status: "error"; readonly message: string; readonly values: Readonly<Record<string, string>> };

function Form({ send }: { readonly send: (state: State, data: FormData) => Promise<State> }): ReactElement {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useGuardedFormState<State>(send, { status: "idle" }, (message, data) => ({ status: "error", message, values: typedValues(data) }), formRef);
  return (
    <form ref={formRef} action={action}>
      <input name="name" defaultValue={state.status === "error" ? state.values.name : ""} />
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      <button type="submit">Save</button>
    </form>
  );
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function mount(send: (state: State, data: FormData) => Promise<State>): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Form send={send} />));
  return host;
}

async function typeAndSave(host: HTMLElement, text: string): Promise<void> {
  const input = host.querySelector("input") as HTMLInputElement;
  input.value = text;
  await act(async () => {
    host.querySelector("form")?.requestSubmit();
  });
}

describe("useGuardedFormState", () => {
  it("keeps the typed input and shows the recoverable error when the request is rejected", async () => {
    const host = await mount(async () => {
      throw new TypeError("Failed to fetch");
    });
    await typeAndSave(host, "Asha Traders");
    expect(host.querySelector("[role=alert]")?.textContent).toBe(DROPPED_ACTION_MESSAGE);
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("Asha Traders");
  });

  it("passes the action's own answer through", async () => {
    const host = await mount(async () => ({ status: "error", message: "Enter a name.", values: { name: "" } }));
    await typeAndSave(host, "x");
    expect(host.querySelector("[role=alert]")?.textContent).toBe("Enter a name.");
  });

  it("lets a redirect through to Next", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/x;307;" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = await mount(async () => {
      throw redirect;
    });
    await expect(typeAndSave(host, "x")).rejects.toBe(redirect);
    errors.mockRestore();
  });
});

describe("support form drop state", () => {
  it("is an error that keeps the submission key, so Save again cannot repeat the work", () => {
    const data = new FormData();
    data.set("submissionKey", "key-12345678");
    const state: StaffSupportActionState = staffSupportDropped(DROPPED_ACTION_MESSAGE, data);
    expect(state).toEqual({ kind: "error", message: DROPPED_ACTION_MESSAGE, submissionKey: "key-12345678" });
    expect(staffSupportDropped("x").submissionKey).toBeUndefined();
    expect(STAFF_SUPPORT_INITIAL_STATE.kind).toBe("idle");
  });
});
