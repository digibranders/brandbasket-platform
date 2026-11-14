import { BRAND } from "./brand";

/**
 * Launch path steps shown in the sign-up side panel, tailored to the chosen service.
 * Rule: Website steps ("We build your website. You review it. It goes live.") are ONLY shown
 * when Managed Website is chosen. Other services get their own distinct launch path.
 */

export const WEBSITE_LAUNCH_STEPS = [
  "Sign up.",
  "Book your call.",
  "Send your details.",
  "We build your website.",
  "You review it.",
  "It goes live.",
] as const;

export const SOCIAL_LAUNCH_STEPS = [
  "Sign up.",
  "Connect your accounts.",
  "We create your posts.",
  "You approve them.",
  "Posts go live.",
] as const;

export const ADS_LAUNCH_STEPS = [
  "Sign up.",
  "Set your goals.",
  "We build your campaigns.",
  "You approve them.",
  "Ads start running.",
] as const;

export const BUNDLE_NO_WEBSITE_STEPS = [
  "Sign up.",
  "Connect your accounts.",
  "We create your campaigns.",
  "You approve them.",
  "Everything goes live.",
] as const;

export const INVITE_STEPS = [
  "Create your account.",
  "Confirm your email.",
  "Join your team.",
  "Start collaborating.",
] as const;

export interface SignUpPanelCopy {
  readonly steps: readonly string[];
  readonly promise: string;
  readonly heading: {
    readonly title: string;
    readonly lede: string;
  };
}

/**
 * Returns the side panel launch steps, monthly promise, and page heading for the sign-up screen,
 * based on the services the user selected.
 */
export function signUpPanelCopy(services: readonly string[], isInvite = false): SignUpPanelCopy {
  if (isInvite) {
    return {
      steps: INVITE_STEPS,
      promise: `Welcome to ${BRAND.name}.`,
      heading: {
        title: "Join your team.",
        lede: `Create an account to join your team on ${BRAND.name}.`,
      },
    };
  }

  const hasWebsite = services.includes("managed-website");
  const hasSocial = services.includes("social-media");
  const hasAds = services.includes("paid-ads");

  if (hasWebsite) {
    return {
      steps: WEBSITE_LAUNCH_STEPS,
      promise: "Then we look after it, every month.",
      heading: {
        title: "Create your account.",
        lede: `One account for your business on ${BRAND.name}.`,
      },
    };
  }

  if (hasSocial && hasAds) {
    return {
      steps: BUNDLE_NO_WEBSITE_STEPS,
      promise: "Then we manage your growth, every month.",
      heading: {
        title: "Grow your business.",
        lede: `Social media and paid ads managed together on ${BRAND.name}.`,
      },
    };
  }

  if (hasSocial) {
    return {
      steps: SOCIAL_LAUNCH_STEPS,
      promise: "Then we grow your audience, every month.",
      heading: {
        title: "Start your social media.",
        lede: `AI content, captions and scheduling managed for your business on ${BRAND.name}.`,
      },
    };
  }

  if (hasAds) {
    return {
      steps: ADS_LAUNCH_STEPS,
      promise: "Then we optimise your ads, every month.",
      heading: {
        title: "Start your paid ads.",
        lede: `Targeted campaigns and creative ads managed for your business on ${BRAND.name}.`,
      },
    };
  }

  // Fallback / default
  return {
    steps: WEBSITE_LAUNCH_STEPS,
    promise: "Then we look after it, every month.",
    heading: {
      title: "Create your account.",
      lede: `One account for your business on ${BRAND.name}.`,
    },
  };
}
