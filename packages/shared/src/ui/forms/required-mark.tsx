import type { ReactElement } from "react";
import { cn } from "../../lib/cn";

/**
 * The asterisk after a required field's label. Hidden from screen readers, which already announce "required" from
 * the field's own `required` attribute; the mark is for sighted people scanning the form.
 */
export function RequiredMark({ className }: { readonly className?: string }): ReactElement {
  return (
    <span aria-hidden="true" className={cn("ml-0.5 font-semibold text-accent", className)}>
      *
    </span>
  );
}
