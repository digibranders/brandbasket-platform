/** Login roles the application uses. Created by `pnpm db:roles`; migrations grant their privileges. */
export const APPLICATION_ROLES = [
  { name: "fynix_app", passwordEnv: "FYNIX_APP_PASSWORD" },
  { name: "fynix_staff", passwordEnv: "FYNIX_STAFF_PASSWORD" },
  { name: "fynix_public", passwordEnv: "FYNIX_PUBLIC_PASSWORD" },
  // The CMS (Payload) owns its own database and migrates it itself; it never touches the application's.
  { name: "fynix_cms", passwordEnv: "FYNIX_CMS_PASSWORD" },
] as const;

/** The database the CMS role owns. */
export const CMS_DATABASE = "fynix_platform_payload";
/** The role that owns it. */
export const CMS_ROLE = "fynix_cms";
