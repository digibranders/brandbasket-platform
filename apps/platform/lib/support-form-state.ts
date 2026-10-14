export interface SupportFormState {
  readonly status: "idle" | "error" | "saved";
  readonly message: string;
  readonly field: string | null;
  readonly ticketId: string | null;
  readonly reference: string | null;
}

export const INITIAL_SUPPORT_STATE: SupportFormState = { status: "idle", message: "", field: null, ticketId: null, reference: null };

export function supportFormError(message: string, field: string | null = null): SupportFormState {
  return { ...INITIAL_SUPPORT_STATE, status: "error", message, field };
}
