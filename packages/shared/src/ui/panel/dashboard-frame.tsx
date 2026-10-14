import type { ReactElement, ReactNode } from "react";
import { WordmarkLogo, type BrandLogo } from "@fynix/shared/ui/logo";
import { CrownIcon, HeartIcon } from "@fynix/shared/ui/icons";
import { AccountBar, type AccountBarAccount } from "./account-bar";
import { SidebarNav, type SidebarNavItem } from "./sidebar-nav";
import { cn } from "../../lib/cn";
import { siteConfig } from "../../lib/site-config";
import type { AccountPanel } from "../../lib/account-panel";

/** Which plan the customer is on, said under the wordmark: a gold crown for Premium, a heart for Care, and no mark for Free. */
export interface DashboardPlanChip {
  readonly label: string;
  readonly mark: "crown" | "heart" | null;
}

function PlanChip({ plan, dark }: { readonly plan: DashboardPlanChip; readonly dark: boolean }): ReactElement {
  return (
    <p className={cn("flex items-center gap-[0.4375rem] whitespace-nowrap text-[0.8125rem] font-medium", dark ? "text-paper/80" : "text-ink-soft")}>
      {plan.mark === "crown" ? <CrownIcon className="size-[0.9375rem] shrink-0 fill-gold text-gold-deep" /> : null}
      {plan.mark === "heart" ? <HeartIcon className="size-[1.125rem] shrink-0 text-[#f2b8c2]" /> : null}
      {plan.label}
    </p>
  );
}

interface DashboardFrameProps {
  readonly nav: readonly SidebarNavItem[];
  readonly account: AccountBarAccount;
  /** Notices, the live site and its status — customer surfaces only; the staff console passes null. */
  readonly panel: AccountPanel | null;
  /** The app's own sign-out action, handed to the account bar. */
  readonly signOut: () => Promise<void>;
  /** Whatever the surface puts across the top: search and actions for staff, a caption for customers. */
  readonly topBar: ReactNode;
  readonly children: ReactNode;
  /** The plan chip under the wordmark. Left off where there is no plan to name (the support and affiliate frames). */
  readonly plan?: DashboardPlanChip;
  /** The logo to draw. */
  readonly brand: BrandLogo;
  /** "dark" (both dashboards today) frames the panel in deep burgundy; "light" is the cream frame. */
  readonly variant?: "light" | "dark";
}

/**
 * The sidebar-and-top-bar frame shared by the staff console and the customer dashboard.
 *
 * The page ground is the brand surface and the sidebar sits directly on it; the working area is a square-cornered
 * panel inset from it, so the brand colour reads as a frame around the content rather than a stripe beside it. Inside
 * it everything is set in Inter (`dashboard-type`).
 */
export function DashboardFrame({
  signOut, nav,
  account,
  panel,
  topBar,
  children,
  plan,
  brand,
  variant = "light",
}: DashboardFrameProps): ReactElement {
  const dark = variant === "dark";
  const bar = {
    account,
    panel,
    dark,
    docsUrl: brand.siteUrl ?? `${siteConfig.url}/faq`,
    contactEmail: brand.email ?? siteConfig.email,
    brandName: brand.name,
  };
  return (
    <div className={cn("dashboard-type flex min-h-dvh flex-col lg:flex-row", dark ? "bg-dark-surface" : "bg-paper-deep")}>
      <aside
        // `relative z-20` keeps an open account menu above the working panel, which is its own stacking context.
        // `data-surface` turns the focus ring to paper on the dark sidebar, where the burgundy one disappears.
        data-surface={dark ? "dark" : undefined}
        className="relative z-20 flex shrink-0 flex-col gap-6 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:py-6 lg:pl-5 lg:pr-4"
      >
        <div className="flex items-center justify-between gap-3 lg:px-2.5">
          <div className="flex flex-col gap-1.5">
            {/* The website's wordmark, the same as on the sign-in screens: white on the dark sidebar. */}
            <WordmarkLogo href="/" tone={dark ? "light" : "accent"} brand={brand} />
            {plan === undefined ? null : <PlanChip plan={plan} dark={dark} />}
          </div>
          <div className="min-w-0 max-w-[15rem] flex-1 lg:hidden">
            <AccountBar signOut={signOut} {...bar} placement="bottom" />
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto px-1 lg:mx-0 lg:flex-1 lg:overflow-visible lg:px-0">
          <SidebarNav items={nav} variant={variant} />
        </div>

        <div className={cn("hidden border-t pt-3 lg:block", dark ? "border-paper/20" : "border-line/70")}>
          <AccountBar signOut={signOut} {...bar} />
        </div>
      </aside>

      {/* The working panel, square-cornered: full-bleed on phones, inset on every side from `lg` up. It clips rather than
          hides overflow, so sticky bars inside it (the blog editor's actions) still stick. */}
      <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-clip bg-paper lg:mb-4 lg:mr-4 lg:mt-4">
        <header className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-8">{topBar}</header>

        <main id="main" className="min-w-0 flex-1 px-5 pb-16 pt-4 sm:px-8">
          {children}
        </main>

      </div>
    </div>
  );
}
