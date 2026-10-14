/** Login roles the application uses. Created by `pnpm db:roles`; migrations grant their privileges. */
export const APPLICATION_ROLES = [
  { name: "firstfold_app", passwordEnv: "FIRSTFOLD_APP_PASSWORD" },
  { name: "firstfold_staff", passwordEnv: "FIRSTFOLD_STAFF_PASSWORD" },
  { name: "firstfold_public", passwordEnv: "FIRSTFOLD_PUBLIC_PASSWORD" },
  // Legacy roles kept for backward compatibility with migrations 0001-0128
  { name: "webfold_app", passwordEnv: "FIRSTFOLD_APP_PASSWORD" },
  { name: "webfold_staff", passwordEnv: "FIRSTFOLD_STAFF_PASSWORD" },
  { name: "webfold_public", passwordEnv: "FIRSTFOLD_PUBLIC_PASSWORD" },
] as const;
