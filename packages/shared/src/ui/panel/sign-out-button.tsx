import type { ReactElement } from "react";
import { SignOutIcon } from "@firstfold/shared/ui/icons";
import { cn } from "../../lib/cn";

interface SignOutButtonProps {
  /**
   * The app's own sign-out server action. Passed in rather than imported: this component is shared by the
   * customer dashboard and the staff console, which sign out through different actions.
   */
  readonly signOut: () => Promise<void>;
  /** "dark" matches the admin console's deep-burgundy sidebar; "light" (default) matches the cream one. */
  readonly variant?: "light" | "dark";
}

export function SignOutButton({ signOut, variant = "light" }: SignOutButtonProps): ReactElement {
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
        <SignOutIcon className="size-4" />
        Sign out
      </button>
    </form>
  );
}
