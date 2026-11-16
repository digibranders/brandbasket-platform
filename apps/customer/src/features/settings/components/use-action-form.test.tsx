import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DROPPED_ACTION_MESSAGE } from "@brandbasket/shared/lib/guard-action";
import type { ActionResult } from "@/lib/action-result";
import { useActionForm } from "./use-action-form";

function Form({ send, onSuccess }: { readonly send: (data: FormData) => Promise<ActionResult>; readonly onSuccess?: () => void }) {
  const form = useActionForm(send, onSuccess);
  return (
    <form onSubmit={form.submit}>
      <input name="name" aria-label="Name" />
      {form.failure === null ? null : <p role="alert">{form.failure.message}</p>}
      <button type="submit">Save</button>
    </form>
  );
}

describe("useActionForm", () => {
  it("keeps the typed input and shows the recoverable error when the request is rejected", async () => {
    const send = vi.fn(async (): Promise<ActionResult> => {
      throw new TypeError("Failed to fetch");
    });
    const onSuccess = vi.fn();
    render(<Form send={send} onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe(DROPPED_ACTION_MESSAGE);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Asha");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("still reports a success to the caller", async () => {
    const onSuccess = vi.fn();
    render(<Form send={async () => ({ ok: true })} onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });
});
