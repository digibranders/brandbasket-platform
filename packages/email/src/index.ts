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
export { emailBrandName, emailLogoUrl, emailSenderDefaults, emailTeamInboxDefault, type EmailAddress } from "./brand";
export { createOutboxTransport, OUTBOX_TRANSPORT_NAME, type EmailTransport, type OutboxOptions } from "./outbox";
export { affiliateLinkEmail, type AffiliateLinkInput } from "./templates/affiliate-link";
export { businessInviteEmail, type BusinessInviteInput } from "./templates/business-invite";
export { bookingCodeEmail, type BookingCodeInput } from "./templates/booking-code";
export { changeRequestUpdateEmail, type ChangeRequestUpdate, type ChangeRequestUpdateInput } from "./templates/change-request-update";
export { leadReceivedEmail, type LeadReceivedInput } from "./templates/lead-received";
export { listingEnquiryEmail, type ListingEnquiryInput } from "./templates/listing-enquiry";
export { passwordResetEmail, type PasswordResetInput } from "./templates/password-reset";
export { privacyRequestCodeEmail, type PrivacyRequestCodeInput } from "./templates/privacy-request-code";
export { domainConnectedEmail, type DomainConnectedInput } from "./templates/domain-connected";
export { domainMovedEmail, type DomainMovedInput } from "./templates/domain-moved";
export { domainRequestedEmail, type DomainRequestedInput } from "./templates/domain-requested";
export { domainReadyEmail, type DomainReadyInput } from "./templates/domain-ready";
export { onboardingSentEmail, type OnboardingSentInput } from "./templates/onboarding-sent";
export { assertMinorUnits, emailDate, emailMoney, type EmailCurrency } from "./format";
export { paymentFailedEmail, type PaymentFailedInput, type PaymentFailedPlan } from "./templates/payment-failed";
export { monthlyReportEmail, type MonthlyReportInput } from "./templates/monthly-report";
export { paymentReceivedEmail, type PaymentReceivedInput } from "./templates/payment-received";
export {
  previewChangesReceivedEmail,
  CHANGES_QUOTE_LIMIT,
  clampChangesText,
  type PreviewChangesReceivedInput,
} from "./templates/preview-changes-received";
export { previewApprovedEmail, type PreviewApprovedInput } from "./templates/preview-approved";
export { previewReadyEmail, type PreviewReadyInput } from "./templates/preview-ready";
export {
  previewRevisionsRequestedEmail,
  type PreviewRevisionsRequestedInput,
} from "./templates/preview-revisions-requested";
export { signupCodeEmail, type SignupCodeInput } from "./templates/signup-code";
export { signupReminderEmail, type SignupReminderInput } from "./templates/signup-reminder";
export { siteDownAlertEmail, type SiteDownAlertInput } from "./templates/site-down-alert";
export { setupLinkEmail, type SetupLinkInput } from "./templates/setup-link";
export { supportRequestOpenedEmail, type SupportRequestOpenedInput } from "./templates/support-request-opened";
export { staffInviteEmail, type StaffInviteInput } from "./templates/staff-invite";
export { websiteLiveEmail, type WebsiteLiveInput } from "./templates/website-live";
export {
  BrevoDeliveryError,
  createAppEmailTransport,
  createBrevoTransport,
  createDualTransport,
  createEmailDelivery,
  EmailConfigurationError,
  emailFailureSummary,
  type BrevoConfig,
  type BrevoReceipt,
  type BrevoSender,
  type BrevoTransport,
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
