import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DROPPED_ACTION_MESSAGE } from "@brandbasket/shared/lib/guard-action";
import type { ActionResult } from "./action-result";
import { useGuardedActionState } from "./use-guarded-action-state";

type Send = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;

function Form({ send }: { readonly send: Send }) {
  const [state, action, pending, formRef] = useGuardedActionState(send);
  return (
    <form action={action} ref={formRef}>
      <input name="title" aria-label="Title" defaultValue="" />
      <textarea name="body" aria-label="Body" defaultValue="" />
      <input name="agree" type="checkbox" aria-label="Agree" />
      <input name="secret" type="password" aria-label="Secret" />
      {state !== null && !state.ok && !pending ? <p role="alert">{state.message}</p> : null}
      <button type="submit">Save</button>
    </form>
  );
}

async function fillAndSave(): Promise<void> {
  await userEvent.type(screen.getByLabelText("Title"), "Spring offer");
  await userEvent.type(screen.getByLabelText("Body"), "Ten percent off");
  await userEvent.click(screen.getByLabelText("Agree"));
  await userEvent.type(screen.getByLabelText("Secret"), "hunter2");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("useGuardedActionState", () => {
  it("keeps the typed input and shows a recoverable error when the request is rejected", async () => {
    const send = vi.fn<Send>(async () => {
      throw new TypeError("Failed to fetch");
    });
    render(<Form send={send} />);
    await fillAndSave();

    expect((await screen.findByRole("alert")).textContent).toBe(DROPPED_ACTION_MESSAGE);
    await waitFor(() => expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Spring offer"));
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe("Ten percent off");
    expect((screen.getByLabelText("Agree") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Secret") as HTMLInputElement).value).toBe("");
  });

  it("lets the person press Save again after a drop", async () => {
    const send = vi
      .fn<Send>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true });
    render(<Form send={send} />);
    await fillAndSave();
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[1].get("title")).toBe("Spring offer");
  });

  it("passes a refusal from the action through unchanged", async () => {
    render(<Form send={async () => ({ ok: false, message: "Add a title." })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Add a title.");
  });
});
