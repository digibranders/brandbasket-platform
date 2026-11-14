"use server";

/**
 * The action lives only in the prompt popup and Today. The client Website tab and Messages tab show read-only status.
 * Marking a kickoff call from the client page is forbidden.
 */
export async function markCallHeldAction(): Promise<void> {
  throw new Error("Kickoff calls can only be confirmed from the prompt popup or Today.");
}

/** The action lives only in the prompt popup and Today. Undoing a kickoff mark is not available from the client tab. */
export async function undoCallHeldAction(): Promise<void> {
  throw new Error("Kickoff call actions are not available from this tab.");
}
