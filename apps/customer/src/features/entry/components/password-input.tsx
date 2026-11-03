"use client";

import { useState, type ComponentPropsWithRef } from "react";
import { IconButton, Input } from "@/ui";

type PasswordInputProps = Omit<ComponentPropsWithRef<typeof Input>, "type">;

/** A password field with a button that shows or hides what was typed. Use inside a Field. */
export function PasswordInput(props: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={revealed ? "text" : "password"} className="pr-10" />
      <IconButton
        icon="Eye"
        label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        tooltip={false}
        onClick={() => setRevealed((shown) => !shown)}
        className="absolute top-1/2 right-1 -translate-y-1/2"
      />
    </div>
  );
}
