import type { ReactElement } from "react";
import { ArrowIcon, SignOutIcon } from "@fynix/shared/ui/icons";
import { cn } from "../../lib/cn";

interface SignOutButtonProps {
  /**
   * The app's own sign-out server action. Passed in rather than imported: this component is shared by the
   * customer dashboard and the staff console, which sign out through different actions.
   */
  readonly signOut: () => Promise<void>;
  /** "dark" matches the admin console's deep-burgundy sidebar; "light" (default) matches the cream one. */
  readonly variant?: "light" | "dark";
  /**
   * The words on the button, "Sign out" by default. A page that holds a signed-in owner on one step (the checkout) calls it
   * "Go back": it still ends the session and returns to the entry page, where the sign-up can be redone.
   */
  readonly label?: string;
}

export function SignOutButton({ signOut, variant = "light", label = "Sign out" }: SignOutButtonProps): ReactElement {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm",
          variant === "dark"
            ? "border-white/15 bg-white/5 text-paper hover:bg-white/10"
            : "border-line bg-card hover:bg-paper-deep",
        )}
      >
        {label === "Sign out" ? <SignOutIcon className="size-4" /> : <ArrowIcon className="size-4 rotate-180" />}
        {label}
      </button>
    </form>
  );
}
