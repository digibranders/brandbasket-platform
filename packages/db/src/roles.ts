/** Login roles the application uses. Created by `pnpm db:roles`; migrations grant their privileges. */
export const APPLICATION_ROLES = [
  { name: "bb_app", passwordEnv: "BRANDBASKET_APP_PASSWORD" },
  { name: "bb_staff", passwordEnv: "BRANDBASKET_STAFF_PASSWORD" },
  { name: "bb_public", passwordEnv: "BRANDBASKET_PUBLIC_PASSWORD" },
  // The CMS (Payload) owns its own database and migrates it itself; it never touches the application's.
  { name: "bb_cms", passwordEnv: "BRANDBASKET_CMS_PASSWORD" },
] as const;

/** The database the CMS role owns. */
export const CMS_DATABASE = "brandbasket_platform_payload";
/** The role that owns it. */
export const CMS_ROLE = "bb_cms";
