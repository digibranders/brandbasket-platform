"use client";
import { EyeIcon, EyeOffIcon } from "@brandbasket/shared/ui/icons";
import { type ComponentProps, type ReactElement, useState } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { fieldClasses } from "./field-styles";

type SecretInputProps = Omit<ComponentProps<"input">, "type">;

/**
 * A field for pasting a secret: hidden by default, so it is not read over a shoulder or on a shared screen, with an eye
 * button to show it while you check what you pasted. It is still a plain input in the form, so it posts like any other.
 */
export function SecretInput({ className, ...props }: SecretInputProps): ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cn(fieldClasses, "pr-12", className)} />
      <button
        type="button"
        onClick={() => setShown((now) => !now)}
        aria-label={shown ? "Hide the address" : "Show the address"}
        aria-pressed={shown}
        className="absolute right-2 top-1/2 mt-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-soft transition-colors duration-300 ease-calm hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {shown ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  );
}
