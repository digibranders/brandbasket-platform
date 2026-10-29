"use client";

import { useRef, useState, useTransition, type ReactElement } from "react";
import { renameChatbotAction } from "@/app/app-host/(protected)/website/enquiries/actions";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";

/**
 * An assistant's name with a small Rename button. Opening it shows the name in a box; saving changes the name on this page.
 * The name is the customer's own label for the assistant. A refusal is said in a sentence under the box.
 */
export function ChatbotName({ chatbotId, name }: { readonly chatbotId: string; readonly name: string }): ReactElement {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">{name}</h2>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setEditing(true);
          }}
          className={SOFT_BUTTON}
        >
          Rename<span className="sr-only"> {name}</span>
        </button>
      </div>
    );
  }

  return (
    <form
      className="max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const next = input.current?.value ?? "";
        startTransition(async () => {
          const result = await renameChatbotAction(chatbotId, next).catch(() => null);
          if (result === null) setMessage("We could not save the name just now. Try again in a minute.");
          else if (result.ok) {
            setMessage(null);
            setEditing(false);
          } else setMessage(result.message);
        });
      }}
    >
      <label className="block text-[0.8125rem] font-semibold text-ink">
        Assistant name
        <input
          ref={input}
          name="name"
          defaultValue={name}
          maxLength={80}
          required
          autoFocus
          autoComplete="off"
          aria-describedby={message === null ? undefined : `${chatbotId}-rename-message`}
          className="mt-1.5 block w-full rounded-control border border-ink-2/65 bg-card px-3.5 py-2.5 text-[0.9375rem] text-ink hover:border-ink-2 focus:border-ink focus:outline-none"
        />
      </label>
      {message === null ? null : (
        <p id={`${chatbotId}-rename-message`} role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={DARK_BUTTON}
        >
          {pending ? "Saving" : "Save name"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            setEditing(false);
          }}
          className={`${SOFT_BUTTON} disabled:cursor-not-allowed disabled:opacity-45`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
