import { INDIA_STATES } from "@brandbasket/shared/lib/directory/india-states";
import type { SelectOption } from "@/ui";

/** The states an Indian buyer picks from for GST, in alphabetical order. */
export const INDIA_STATE_OPTIONS: readonly SelectOption[] = [...INDIA_STATES]
  .sort((a, b) => a.name.localeCompare(b.name, "en"))
  .map((state) => ({ value: state.code, label: state.name }));
