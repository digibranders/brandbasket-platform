export {
  AccountAlreadyExistsError,
  createAccountWithGrant,
  type CreatedAccount,
  type NewAccount,
} from "./create-account";
export {
  createAuth,
  EMAIL_CONFIRMATION_LIFETIME_SECONDS,
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
export { createPhoneAccountWithGrant, setAccountPassword, type NewPhoneAccount } from "./phone-account";
