export {
  AccountAlreadyExistsError,
  createAccountWithGrant,
  type CreatedAccount,
  type NewAccount,
} from "./create-account";
export {
  createAuth,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_LIFETIME_SECONDS,
  STAFF_SESSION_LIFETIME_SECONDS,
  type AccountMail,
  type Auth,
  type AuthConfig,
  type AuthMailer,
} from "./create-auth";
export { createVerifiedEmailAccountWithGrant } from "./email-account";
export { isAuthApiError, isInvalidCredentialsError, isInvalidTokenError, isWrongPasswordError } from "./errors";
export { resetStaffSignIn, StaffRecoveryError, type StaffRecoveryResult } from "./staff-recovery";
export {
  issueStaffSignInCode,
  STAFF_SIGN_IN_CODE_TTL_SECONDS,
  verifyStaffSignInCode,
  withdrawStaffSignInCode,
  type IssueStaffSignInCodeOutcome,
  type VerifyStaffSignInCodeOutcome,
} from "./staff-sign-in-code";
export { verifyCredentials, type VerifiedCredentials } from "./staff-second-factor";
