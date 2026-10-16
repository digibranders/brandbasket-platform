/** The "I've got my own domain" form's state: idle, or the reason the request was not sent. `field` names the input to point at. */
export type MoveDomainState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly field: "domain" | "ownerConfirmed" | null };

export const initialMoveDomainState: MoveDomainState = { status: "idle" };

export const MOVE_NOT_AVAILABLE_MESSAGE = "You can ask for your own domain once your website is live on its free address. Until then, choose it in your setup.";
export const MOVE_TAKEN_MESSAGE = "That domain is already connected to another website. Email us and we’ll sort it out.";
