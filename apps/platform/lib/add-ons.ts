/**
 * The Add-ons catalogue lives in the shared package, so the server code that charges for an add-on and the page that
 * shows it read the same prices. This file only keeps the app's short import path.
 */
export {
  ADD_ONS,
  ADD_ONS_PATH,
  addOnById,
  addOnPrice,
  type AddOn,
  type AddOnId,
} from "@brandbasket/shared/lib/billing/add-ons";
