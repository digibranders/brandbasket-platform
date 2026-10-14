/** What a Geography form's action hands back: nothing yet, a saved edit, or a refusal in words staff can act on. */
export type GeoFormState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export const initialGeoFormState: GeoFormState = { status: "idle" };
