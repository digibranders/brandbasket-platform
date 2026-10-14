export {
  assertWebUrl,
  escapeHtml,
  htmlDocument,
  sanitizeHeaderValue,
  withheldCodeCopy,
  withheldLinkCopy,
  type EmailMessage,
  type EmailOutboxCopy,
} from "./message";
export { emailBrandName, emailSenderDefaults, emailTeamInboxDefault, type EmailAddress } from "./brand";
export { createOutboxTransport, OUTBOX_TRANSPORT_NAME, type EmailTransport, type OutboxOptions } from "./outbox";
export { bookingCodeEmail, type BookingCodeInput } from "./templates/booking-code";
export { confirmEmailEmail, type ConfirmEmailInput } from "./templates/confirm-email";
export { leadReceivedEmail, type LeadReceivedInput } from "./templates/lead-received";
export { listingEnquiryEmail, type ListingEnquiryInput } from "./templates/listing-enquiry";
export { passwordResetEmail, type PasswordResetInput } from "./templates/password-reset";
export { privacyRequestCodeEmail, type PrivacyRequestCodeInput } from "./templates/privacy-request-code";
export { previewApprovedEmail, type PreviewApprovedInput } from "./templates/preview-approved";
export { previewReadyEmail, type PreviewReadyInput } from "./templates/preview-ready";
export {
  previewRevisionsRequestedEmail,
  type PreviewRevisionsRequestedInput,
} from "./templates/preview-revisions-requested";
export { signupCodeEmail, type SignupCodeInput } from "./templates/signup-code";
export { setupLinkEmail, type SetupLinkInput } from "./templates/setup-link";
export { websiteLiveEmail, type WebsiteLiveInput } from "./templates/website-live";
export {
  BrevoDeliveryError,
  createAppEmailTransport,
  createBrevoTransport,
  createDualTransport,
  createEmailDelivery,
  EmailConfigurationError,
  type BrevoConfig,
  type BrevoSender,
} from "./brevo";
export {
  privacyRequestAlertEmail,
  privacyRequestsDueEmail,
  type PrivacyRequestAlertInput,
  type PrivacyRequestDueItem,
  type PrivacyRequestDueStage,
  type PrivacyRequestsDueInput,
} from "./templates/privacy-request-alert";
export {
  securityEventAlertEmail,
  staffAccessReviewEmail,
  type SecurityEventAlertInput,
  type StaffAccessFinding,
  type StaffAccessReviewInput,
} from "./templates/security-alert";
export {
  supportReplyAlertEmail,
  type SupportReplyAlertInput,
} from "./templates/support-reply-alert";
export {
  supportTicketAlertEmail,
  type SupportTicketAlertInput,
} from "./templates/support-ticket-alert";
export {
  systemErrorAlertEmail,
  type SystemErrorAlertInput,
} from "./templates/system-error-alert";
