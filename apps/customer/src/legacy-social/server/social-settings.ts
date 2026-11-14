import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { brandOf } from "@/features/social/brand";
import type { AutoChannel } from "@/legacy-social/lib/social/auto";
import { sortChannels } from "@/legacy-social/lib/social/review-flow";
import { loadChannels, socialAutoSettings } from "./social-auto";

/** What the Social media tab of Settings shows: the accounts connected for the brand. */
export interface SocialSettings {
  /** False when this server has no posting service: there is nothing to connect to. */
  readonly configured: boolean;
  readonly brandName: string;
  readonly channels: readonly AutoChannel[];
  /** True when a read failed, so the page says so instead of showing nothing as if it were true. */
  readonly unavailable: boolean;
}

export async function loadSocialSettings(customer: Pick<CustomerContext, "businessId" | "businessName">): Promise<SocialSettings> {
  const settings = socialAutoSettings();
  if (settings === null) return { configured: false, brandName: customer.businessName, channels: [], unavailable: false };
  const brand = await brandOf(customer);
  const [channels] = await Promise.allSettled([loadChannels(settings, brand.externalId)]);
  if (channels.status === "rejected") reportError(channels.reason, { area: "social.settings.load" });
  return {
    configured: true,
    brandName: brand.name,
    channels: channels.status === "fulfilled" ? sortChannels(channels.value) : [],
    unavailable: channels.status === "rejected",
  };
}
