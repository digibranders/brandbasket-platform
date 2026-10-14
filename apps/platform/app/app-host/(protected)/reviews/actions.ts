"use server";

import { revalidatePath } from "next/cache";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { getOwnedDirectoryBusiness } from "@/lib/server/owner-business";
import { changeReply, postReply, takeDownReply, type OwnerReplyOutcome } from "@/lib/server/owner-replies";

/**
 * The Reviews page's three forms: answer a review, change an answer, take one down. Each one checks who is asking all
 * over again (the page that drew the form may be hours old), then hands the work to the same code the website's own
 * page uses, so an answer means the same wherever it is written.
 */

const NOT_OWNER_MESSAGE = "Only this business's verified owner can answer its reviews.";
const NOT_FOUND_MESSAGE = "That review or reply is no longer there. Refresh the page.";
const LIMITED_MESSAGE = "You are replying very fast. Wait a little and try again.";
const FAILED_MESSAGE = "We couldn't save your reply. Please try again.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** What a form shows once the work has run: saved, or the reason it was refused next to the field it is about. */
function stateOf(outcome: OwnerReplyOutcome, formData: FormData): PanelFormState {
  switch (outcome.kind) {
    case "saved":
    case "removed":
      // The page lists the answer under its review, and the sidebar and the count of reviews still waiting follow it.
      revalidatePath(REVIEWS_PATH);
      return panelFormSavedState;
    case "invalid":
      return panelFormErrorState({ message: outcome.message, field: "text" }, formData);
    case "not_found":
      return panelFormErrorState({ message: NOT_FOUND_MESSAGE, field: null }, formData);
    case "limited":
      return panelFormErrorState({ message: LIMITED_MESSAGE, field: null }, formData);
    case "failed":
      return panelFormErrorState({ message: FAILED_MESSAGE, field: null }, formData);
  }
}

/** Answers a review: the form posts `reviewId` and `text`. */
export async function postReplyAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await getOwnedDirectoryBusiness();
  if (owner.kind !== "owner") return panelFormErrorState({ message: NOT_OWNER_MESSAGE, field: null }, formData);
  return stateOf(await postReply(owner, { reviewId: text(formData, "reviewId"), text: text(formData, "text") }, new Date()), formData);
}

/** Changes an answer: the form posts `commentId` and `text`. */
export async function editReplyAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await getOwnedDirectoryBusiness();
  if (owner.kind !== "owner") return panelFormErrorState({ message: NOT_OWNER_MESSAGE, field: null }, formData);
  return stateOf(await changeReply(owner, { commentId: text(formData, "commentId"), text: text(formData, "text") }, new Date()), formData);
}

/** Takes an answer down: the form posts `commentId`. */
export async function removeReplyAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await getOwnedDirectoryBusiness();
  if (owner.kind !== "owner") return panelFormErrorState({ message: NOT_OWNER_MESSAGE, field: null }, formData);
  return stateOf(await takeDownReply(owner, { commentId: text(formData, "commentId") }, new Date()), formData);
}
