import { loadGeoAdminCatalog, type GeoAdminCatalog } from "@fynix/db";
import { geoCatalogSource } from "@fynix/shared/lib/directory/geo-catalog-source";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { SearchIcon } from "@fynix/shared/ui/icons";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { GeoPager } from "@/components/geo-pager";
import { AddAreaForm, AddCategoryForm, AddDistrictForm, AreaRow, CategoryRow, DistrictRow } from "@/components/geo-rows";
import {
  districtKeyOf,
  filterAreas,
  filterCategories,
  filterDistricts,
  geographyHref,
  paginate,
  parseGeographyView,
  type GeographyTab,
  type GeographyView,
} from "@/lib/geography-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Geography" };

interface GeographyPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}


const TAB_LABELS: Readonly<Record<GeographyTab, string>> = { districts: "Districts", areas: "Areas", categories: "Categories" };

export default async function GeographyPage({ searchParams }: GeographyPageProps): Promise<ReactElement> {
  await requireStaffAccess();
  const view = parseGeographyView(await searchParams);
  const catalog = await loadGeoAdminCatalog(getStaffDb());
  const source = geoCatalogSource();

  const selectedDistrict =
    catalog.districts.find((district) => districtKeyOf(district) === view.district) ??
    catalog.districts.find((district) => district.areaCount > 0) ??
    catalog.districts[0];
  const selectedKey = selectedDistrict === undefined ? "" : districtKeyOf(selectedDistrict);
  const parents = catalog.categories.filter((category) => category.parentSlug === null);
  const groupOptions: readonly SelectOption[] = [{ value: "", label: "All groups" }, ...parents.map((parent) => ({ value: parent.slug, label: parent.label }))];

  const tabCounts: Readonly<Record<GeographyTab, number>> = {
    districts: catalog.districts.length,
    areas: catalog.areas.length,
    categories: catalog.categories.length,
  };
  const counts = {
    live: catalog.districts.filter((district) => district.status === "live").length,
    soon: catalog.districts.filter((district) => district.status === "soon").length,
    areasOn: catalog.areas.filter((area) => area.status === "on").length,
    categoriesOn: catalog.categories.filter((category) => category.status === "on").length,
  };
  const tabs = (Object.keys(TAB_LABELS) as GeographyTab[]).map((tab) => ({
    href: geographyHref({ tab }),
    label: TAB_LABELS[tab],
    count: tabCounts[tab],
    current: view.tab === tab,
  }));

  return (
    <>
      <PageHeader
        title="Geography"
        meta={source === "db" ? "The website and the app read this list. Changes show within a minute." : "Where we list, and what we list."}
        action={
          <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm tabular-nums text-ink-soft">
            <span>
              <strong className="font-semibold text-accent">{counts.live}</strong> live
            </span>
            <span>
              <strong className="font-semibold text-ink">{counts.soon}</strong> soon
            </span>
            <span>
              <strong className="font-semibold text-ink">{counts.areasOn}</strong> areas on
            </span>
            <span>
              <strong className="font-semibold text-ink">{counts.categoriesOn}</strong> categories on
            </span>
          </p>
        }
      />

      {source === "db" ? null : (
        <Notice tone="problem" className="mt-4">
          The website and the app still read the built-in lists. Edits are saved here but not live yet.
        </Notice>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <FilterPills label="Geography" options={tabs} />
        <form action="/geography" className="flex items-center gap-2">
          <input type="hidden" name="tab" value={view.tab} />
          {view.tab === "areas" && selectedKey !== "" ? <input type="hidden" name="district" value={selectedKey} /> : null}
          {view.offOnly ? <input type="hidden" name="show" value="off" /> : null}
          {view.tab === "categories" ? (
            <>
              <label className="sr-only" htmlFor="geo-group">
                Group
              </label>
              <SelectField id="geo-group" name="group" options={groupOptions} defaultValue={view.group} className={`${fieldClasses} !mt-0 !w-48 !py-2 !text-sm`} />
            </>
          ) : null}
          <label className="sr-only" htmlFor="geo-search">
            Search
          </label>
          <input id="geo-search" name="q" defaultValue={view.query} placeholder="Search" className={`${fieldClasses} !mt-0 !w-56 !py-2 !text-sm`} />
          <GatedSubmitButton className={buttonSecondary} aria-label="Search">
            <SearchIcon className="size-4" />
          </GatedSubmitButton>
          <Link
            href={geographyHref({ tab: view.tab, district: view.tab === "areas" ? selectedKey : "", group: view.group, query: view.query, offOnly: !view.offOnly })}
            className="px-2 text-sm text-ink-soft hover:text-ink"
          >
            {view.offOnly ? "Show all" : "Off and drafts"}
          </Link>
        </form>
      </div>

      {view.tab === "districts" ? <DistrictsTab catalog={catalog} view={view} /> : null}
      {view.tab === "areas" ? <AreasTab catalog={catalog} view={view} selectedKey={selectedKey} /> : null}
      {view.tab === "categories" ? <CategoriesTab catalog={catalog} view={view} parents={parents} /> : null}
    </>
  );
}

/** The "add one" line above a list; the pager sits at its right end so the list never needs scrolling to page. */
function AddDetails({ summary, pager, children }: { readonly summary: string; readonly pager: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <div className="relative mt-3 border-t border-line pt-3">
      <details>
        <summary className="inline-block cursor-pointer py-1 text-sm font-semibold text-ink hover:text-accent">+ {summary}</summary>
        <div className="mt-4">{children}</div>
      </details>
      <div className="absolute right-0 top-3">{pager}</div>
    </div>
  );
}

function DistrictsTab({ catalog, view }: { readonly catalog: GeoAdminCatalog; readonly view: GeographyView }): ReactElement {
  const { rows, page, pageCount } = paginate(filterDistricts(catalog.districts, view), view.page);
  return (
    <>
      <AddDetails summary="Add a district" pager={<GeoPager view={view} page={page} pageCount={pageCount} />}>
        <AddDistrictForm />
      </AddDetails>
      {rows.length === 0 ? (
        <EmptyLine>No districts match.</EmptyLine>
      ) : (
        <ul aria-label="Districts" className="mt-2 border-t border-line">
          {rows.map((district) => (
            <DistrictRow key={district.id} district={district} />
          ))}
        </ul>
      )}
    </>
  );
}

function AreasTab({
  catalog,
  view,
  selectedKey,
}: {
  readonly catalog: GeoAdminCatalog;
  readonly view: GeographyView;
  readonly selectedKey: string;
}): ReactElement {
  const selected = catalog.districts.find((district) => districtKeyOf(district) === selectedKey);
  const { rows, page, pageCount } = paginate(filterAreas(catalog.areas, view, selectedKey), view.page);
  const pickable = catalog.districts.filter((district) => district.areaCount > 0 || district.status !== "off");
  return (
    <>
      <nav aria-label="District" className="-mx-1 mt-4 flex flex-wrap gap-1 px-1">
        {(pickable.length > 0 ? pickable : catalog.districts).map((district) => {
          const current = districtKeyOf(district) === selectedKey;
          return (
            <Link
              key={district.id}
              href={geographyHref({ tab: "areas", district: districtKeyOf(district), query: view.query, offOnly: view.offOnly })}
              aria-current={current ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm ${current ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink"}`}
            >
              {district.name}
            </Link>
          );
        })}
      </nav>
      {selected === undefined ? (
        <EmptyLine>Add a district first.</EmptyLine>
      ) : (
        <>
          <AddDetails summary="Add an area" pager={<GeoPager view={view} district={selectedKey} page={page} pageCount={pageCount} />}>
            <AddAreaForm districts={catalog.districts} selected={selected.id} />
          </AddDetails>
          {rows.length === 0 ? (
            <EmptyLine>No areas match.</EmptyLine>
          ) : (
            <ul aria-label="Areas" className="mt-2 border-t border-line">
              {rows.map((area) => (
                <AreaRow key={area.id} area={area} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function CategoriesTab({
  catalog,
  view,
  parents,
}: {
  readonly catalog: GeoAdminCatalog;
  readonly view: GeographyView;
  readonly parents: GeoAdminCatalog["categories"];
}): ReactElement {
  const { rows, page, pageCount } = paginate(filterCategories(catalog.categories, view), view.page);
  return (
    <>
      <AddDetails summary="Add a category" pager={<GeoPager view={view} page={page} pageCount={pageCount} />}>
        <AddCategoryForm parents={parents} />
      </AddDetails>
      {rows.length === 0 ? (
        <EmptyLine>No categories match.</EmptyLine>
      ) : (
        <ul aria-label="Categories" className="mt-2 border-t border-line">
          {rows.map((category) => (
            <CategoryRow key={category.id} category={category} parents={parents} />
          ))}
        </ul>
      )}
    </>
  );
}
