/**
 * The one button look for every pattern (NextActionCard, ApprovalCard, PromptPopup, ConfirmDialog), as class strings so
 * they fit a `button` and an `a` alike. Matches the customer app's Button: 36px high (44px on a phone), 8px radius,
 * 14px semibold. `no-underline` is needed on a link because the apps underline every `a`.
 */
const BASE =
  "relative inline-flex h-9 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border px-3.5 font-sans text-sm font-semibold leading-5 no-underline transition-colors duration-100 active:translate-y-[1px] max-[860px]:h-11 disabled:cursor-not-allowed disabled:opacity-50";

export const patternButtonPrimary = `${BASE} border-ink bg-ink text-on-primary shadow-button hover:border-primary-hover hover:bg-primary-hover`;

export const patternButtonSecondary = `${BASE} border-border bg-surface text-ink shadow-button hover:bg-surface-hover`;

export const patternButtonDanger = `${BASE} border-neg-text bg-neg-text text-on-primary hover:opacity-90`;
