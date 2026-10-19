import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ArrowIcon, StarIcon } from "@brandbasket/shared/ui/icons";
import {
  NavCircleArrowUpIcon,
  NavCirclePlusIcon,
  NavInboxIcon,
  NavMegaphoneIcon,
  NavPercentIcon,
  NavScrollTextIcon,
  NavStarIcon,
  NavStorefrontIcon,
} from "@brandbasket/shared/ui/nav-icons";
import { DashboardFrame } from "@brandbasket/shared/ui/panel/dashboard-frame";
import type { SidebarNavItem } from "@brandbasket/shared/ui/panel/sidebar-nav";
import { joinSections } from "@/lib/sidebar-sections";
import { HiddenOnPaths } from "@/components/panel/hidden-on-paths";
import { ADD_ONS_PATH } from "@/lib/add-ons";
import { DEALS_PATH } from "@/lib/deals";
import { LEADS_PATH } from "@/lib/leads";
import { REVIEWS_PATH } from "@/lib/owner-replies";
import { CARE_PATH, MEMBERSHIP_PATH, UPGRADE_PATH } from "@/lib/membership";
import { ADVERTISE_PATH, LISTING_PAGE_PATH } from "@/lib/server/customer-access";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { signOut } from "@/lib/server/sign-out";

interface ListingAccountShellProps {
  readonly userName: string;
  readonly userEmail: string;
  /**
   * The membership's price ("₹2,999 a month + 18% GST") for the line that points an account with no website of its
   * own at Premium. Null leaves the line out: the account has its own website, or no plan is on sale. Premium stays
   * in the sections either way.
   */
  readonly premiumOffer: string | null;
  /** The Business ID as the owner reads it, for the account menu; null before the business has one. */
  readonly businessId: string | null;
  /** Enquiries the owner has not replied to, the pill on Leads. */
  readonly newLeadCount: number;
  readonly children: ReactNode;
}

/**
 * A free listing account's sections: its Business profile (details, photos, where it is listed, publishing it), the
 * leads it brings, the reviews it answers, advertising it, the marketing add-ons it can buy, paying for the spots it wins,
 * and, last, the Upgrade page where it compares Free, Care and Premium and moves up to either on the same account.
 */
function listingAccountNav(newLeadCount: number): readonly SidebarNavItem[] {
  return joinSections([
    [
      { href: LISTING_PAGE_PATH, label: "Business profile", icon: <NavStorefrontIcon className="size-5" /> },
      { href: LEADS_PATH, label: "Leads", icon: <NavInboxIcon className="size-5" />, count: newLeadCount },
      { href: REVIEWS_PATH, label: "Reviews", icon: <NavStarIcon className="size-5" /> },
      { href: DEALS_PATH, label: "Deals", icon: <NavPercentIcon className="size-5" /> },
      { href: ADVERTISE_PATH, label: "Advertise", icon: <NavMegaphoneIcon className="size-5" /> },
    ],
    [
      { href: ADD_ONS_PATH, label: "Add-ons", icon: <NavCirclePlusIcon className="size-5" /> },
      { href: "/billing", label: "Billing", icon: <NavScrollTextIcon className="size-5" /> },
    ],
    [{ href: UPGRADE_PATH, label: "Upgrade", icon: <NavCircleArrowUpIcon className="size-5" /> }],
  ]);
}

/** The plan pages say all of this themselves, so the line is left off them. */
const PAGES_WITHOUT_THE_OFFER = [UPGRADE_PATH, MEMBERSHIP_PATH, CARE_PATH] as const;

/**
 * The dashboard for a free listing account (docs/superpowers/specs/2026-09-30-directory-ads-auction-design.md). It has
 * no website, plan or project, so none of the website client's sections, banner or account notices apply. An account
 * that said it has no website sees Premium highlighted in the top bar on every page (docs/superpowers/specs/2026-09-30-
 * single-entry-premium-design.md).
 */
export async function ListingAccountShell({
  userName,
  userEmail,
  premiumOffer,
  businessId,
  newLeadCount,
  children,
}: ListingAccountShellProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <DashboardFrame
      signOut={signOut}
      nav={listingAccountNav(newLeadCount)}
      account={{ name: userName, email: userEmail, href: "/settings", ...(businessId === null ? {} : { businessId }) }}
      panel={null}
      variant="dark"
      brand={logoOf(brand)}
      plan={{ label: "Free listing", mark: null }}
      topBar={
        <>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">Your {brand.shortName} dashboard</p>
          {premiumOffer === null ? null : (
            <HiddenOnPaths paths={PAGES_WITHOUT_THE_OFFER}>
              <Link
                href={UPGRADE_PATH}
                className="group ml-auto inline-flex items-center gap-2.5 rounded-full bg-accent-pale px-4 py-2 text-sm font-semibold text-accent-deep transition-colors duration-300 ease-calm hover:bg-accent hover:text-paper"
              >
                <StarIcon className="size-4 shrink-0" />
                Go Premium
                <span className="hidden font-normal tabular-nums sm:inline">{premiumOffer}</span>
                <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
              </Link>
            </HiddenOnPaths>
          )}
        </>
      }
    >
      {children}
    </DashboardFrame>
  );
}
