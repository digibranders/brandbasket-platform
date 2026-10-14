import type { ReactElement } from "react";
import type { DirectoryProfile } from "@firstfold/db";
import {
  FIXED_PAGE_TABS,
  OPTIONAL_PAGE_TABS,
  PAGE_TAB_LABELS,
  RENAMABLE_PAGE_TABS,
  pageTabLabel,
  type OptionalPageTab,
  type RenamablePageTab,
} from "@firstfold/shared/lib/directory/page-tabs";
import { ArrowIcon, TickIcon } from "@firstfold/shared/ui/icons";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { ItemForm } from "@/components/panel/business/item-form";
import { TabNameField } from "@/components/panel/business/tab-name-field";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import type { ItemFormState } from "@/lib/item-form-state";

function isRenamable(tab: OptionalPageTab): tab is RenamablePageTab {
  return (RENAMABLE_PAGE_TABS as readonly string[]).includes(tab);
}

/** What each optional tab shows, where the owner fills it in, and whether it has anything to show yet. */
export interface PageTabSource {
  readonly href: string;
  /** "3 services", or what is missing: "Nothing added yet". */
  readonly summary: string;
  readonly ready: boolean;
  /** The word on the link beside the tab, when it is neither "Edit" nor "Add" (a tab with nothing to fill in links to where its results arrive). */
  readonly linkLabel?: string;
}

interface PageTabsTabProps {
  /** The saved profile; null before the Identity is saved. */
  readonly profile: DirectoryProfile | null;
  readonly sources: Readonly<Record<OptionalPageTab, PageTabSource>>;
  readonly canChange: boolean;
  readonly saveAction: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

/**
 * The Page tabs tab: the row of tabs along the top of the business's public page. Overview, Location, Reviews and
 * Gallery are always there. The owner turns the others on, and each shows on the page only once it has something in it,
 * so a tab that is on but empty says what to add.
 */
export function PageTabsTab({ profile, sources, canChange, saveAction, next }: PageTabsTabProps): ReactElement {
  if (profile === null) {
    return (
      <div className="mt-8 max-w-2xl space-y-4">
        <p className="text-sm text-ink-soft">Fill in your Identity first, then choose the tabs on your page.</p>
        <ButtonLink href={profileHref("details")} variant="secondary" size="sm">
          Go to Identity
        </ButtonLink>
      </div>
    );
  }
  const chosen = new Set<string>(profile.pageTabs);
  const names: Readonly<Record<RenamablePageTab, string>> = { services: profile.servicesLabel ?? "", products: profile.productsLabel ?? "" };
  const labels = { services: profile.servicesLabel ?? undefined, products: profile.productsLabel ?? undefined };
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-sm text-ink-soft">
        The tabs along the top of your page. Visitors tap one to jump to it. Services and Products can have a name of your own, such as Menu.
      </p>

      <h2 className="panel-section mt-8">Always on</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {FIXED_PAGE_TABS.map((tab) => (
          <li key={tab} className="flex items-center gap-3 py-3.5 text-[0.9375rem]">
            <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-accent text-paper">
              <TickIcon className="size-3" />
            </span>
            <span className="font-medium">{PAGE_TAB_LABELS[tab]}</span>
          </li>
        ))}
      </ul>

      <h2 className="panel-section mt-10">Your choice</h2>
      <div className="mt-3">
        <ItemForm action={saveAction} submitLabel="Save">
          <fieldset disabled={!canChange} className="divide-y divide-line border-y border-line">
            <legend className="sr-only">Tabs on your page</legend>
            {OPTIONAL_PAGE_TABS.map((tab) => {
              const source = sources[tab];
              return (
                <div key={tab} className="py-4">
                  <div className="flex items-start gap-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="checkbox" name="tab" value={tab} defaultChecked={chosen.has(tab)} className="mt-1 size-4 accent-accent" />
                      <span>
                        <span className="block text-[0.9375rem] font-medium">{pageTabLabel(tab, labels)}</span>
                        <span className="mt-0.5 block text-sm text-ink-soft">{source.summary}</span>
                      </span>
                    </label>
                    <a href={source.href} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-300 ease-calm hover:bg-paper-deep">
                      {source.linkLabel ?? (source.ready ? "Edit" : "Add")}
                    </a>
                  </div>
                  {isRenamable(tab) ? (
                    <div className="mt-3">
                      <TabNameField tab={tab} usual={PAGE_TAB_LABELS[tab]} saved={names[tab]} disabled={!canChange} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        </ItemForm>
      </div>

      {next === null ? null : (
        <div className="mt-12">
          <ButtonLink href={profileHref(next.id)} variant="secondary">
            Next: {next.label}
            <ArrowIcon className="size-4" />
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
