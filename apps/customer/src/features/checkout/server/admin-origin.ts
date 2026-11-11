import "server-only";

/** The staff console's origin, for links in staff alerts. ADMIN_ORIGIN when set, else the production console. */
export function adminOrigin(): string {
  const configured = process.env.ADMIN_ORIGIN?.trim() ?? "";
  if (configured === "") return "https://console.brandbasket.in";
  return new URL(configured).origin;
}
