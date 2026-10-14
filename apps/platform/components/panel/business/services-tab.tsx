import type { ReactElement } from "react";
import type { BusinessService } from "@firstfold/db";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { INPUT_CLASSES, ItemRow, Labelled, priceText, RemoveButton } from "@/components/panel/business/catalog-parts";
import { ItemForm } from "@/components/panel/business/item-form";
import {
  CATALOG_MAX_ITEMS,
  ITEM_AREA_MAX_LENGTH,
  ITEM_NAME_MAX_LENGTH,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_SUMMARY_MAX_LENGTH,
} from "@/lib/business-profile-fields";
import { SERVICE_DURATION_MAX_MINUTES } from "@/lib/catalog-form";
import { catalogWords } from "@/lib/catalog-words";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import type { ItemFormState } from "@/lib/item-form-state";
import { RenamedNote } from "@/components/panel/business/renamed-note";
import { WhereItShows } from "@/components/panel/where-it-shows";

/** Whole rupees: digits only. The server also reads "1,500" or "Rs 1500", which the keyboard filter no longer lets through. */
const PRICE_PATTERN = "[0-9]+";
/** One or more digits that are not all zero, with up to four places in all (maxLength): the server holds the 1440 ceiling. */
const DURATION_PATTERN = "0*[1-9][0-9]*";

interface ServicesTabProps {
  readonly services: readonly BusinessService[];
  /** What the owner calls this tab on their page ("Menu"); null while it is "Services". */
  readonly label: string | null;
  /** False once staff have taken the business down: it can look but not change. */
  readonly canChange: boolean;
  readonly saveAction: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly removeAction: (formData: FormData) => Promise<void>;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

interface ServiceFieldsProps {
  readonly service: BusinessService | null;
  /** The label on the name field: "Service", or "Name" once the owner has named the tab. */
  readonly nameField: string;
  /** What one item is called in a sentence: "service", or "item" once the owner has named the tab. */
  readonly itemWord: string;
  /** Keeps ids unique where the form appears once per service. */
  readonly idPrefix: string;
}

/** The sheet's service fields: name, one-line summary, full description, price, duration and area. */
function ServiceFields({ service, nameField, itemWord, idPrefix }: ServiceFieldsProps): ReactElement {
  const id = (field: string): string => `${idPrefix}-${field}`;
  return (
    <>
      <input type="hidden" name="id" value={service?.id ?? ""} />
      <Labelled id={id("name")} label={nameField} required>
        <input id={id("name")} name="name" required maxLength={ITEM_NAME_MAX_LENGTH} placeholder="Teeth scaling" defaultValue={service?.name ?? ""} className={INPUT_CLASSES} />
      </Labelled>
      <Labelled id={id("summary")} label="One line under the name (optional)">
        <input
          id={id("summary")}
          name="summary"
          maxLength={SERVICE_SUMMARY_MAX_LENGTH}
          placeholder="Ultrasonic cleaning that removes plaque and stains"
          defaultValue={service?.summary ?? ""}
          className={INPUT_CLASSES}
        />
      </Labelled>
      <Labelled id={id("description")} label={`Full description, shown when a visitor opens the ${itemWord} (optional)`}>
        <textarea
          id={id("description")}
          name="description"
          rows={6}
          maxLength={SERVICE_DESCRIPTION_MAX_LENGTH}
          defaultValue={service?.description ?? ""}
          className={`${INPUT_CLASSES} resize-y`}
        />
      </Labelled>
      <div className="grid gap-5 sm:grid-cols-3">
        <Labelled id={id("price")} label="Price in ₹ (optional)">
          <RuleInput
            id={id("price")}
            name="price"
            rule="digits"
            maxLength={12}
            pattern={PRICE_PATTERN}
            title="Whole rupees, like 1500"
            placeholder="1500"
            defaultValue={service?.priceInr ?? ""}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
        </Labelled>
        <Labelled id={id("duration")} label="Minutes (optional)">
          <RuleInput
            id={id("duration")}
            name="duration"
            rule="digits"
            maxLength={4}
            pattern={DURATION_PATTERN}
            title={`Whole minutes, from 1 to ${String(SERVICE_DURATION_MAX_MINUTES)}`}
            placeholder="45"
            defaultValue={service?.durationMinutes ?? ""}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
        </Labelled>
        <Labelled id={id("area")} label="Area (optional)">
          <input id={id("area")} name="area" maxLength={ITEM_AREA_MAX_LENGTH} placeholder="Thane" defaultValue={service?.serviceArea ?? ""} className={INPUT_CLASSES} />
        </Labelled>
      </div>
    </>
  );
}

/**
 * The Services tab: what the business does, one list, each with its description, price, duration and area. Optional;
 * "Next" goes on to Products.
 */
export function ServicesTab({ services, label, canChange, saveAction, removeAction, next }: ServicesTabProps): ReactElement {
  const full = services.length >= CATALOG_MAX_ITEMS;
  const words = catalogWords("services", label);
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-sm text-ink-soft">What you do, and what each costs. Visitors see these on your page.</p>
      {label === null ? null : <RenamedNote label={label} />}
      <div className="mt-1">
        <WhereItShows spot="services" caption={`Your ${words.many} show as cards in the ${words.tabName} column beside your page.`} />
      </div>

      {services.length === 0 ? null : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {services.map((service) => (
            <ItemRow
              key={service.id}
              title={service.name}
              facts={[priceText(service.priceInr), ...(service.durationMinutes === null ? [] : [`${String(service.durationMinutes)} min`]), ...(service.serviceArea === null ? [] : [service.serviceArea])]}
              editForm={
                canChange ? (
                  <ItemForm action={saveAction} submitLabel={words.saveSubmit}>
                    <ServiceFields service={service} nameField={words.nameField} itemWord={words.one} idPrefix={`service-${service.id}`} />
                  </ItemForm>
                ) : null
              }
              removeForm={canChange ? <RemoveButton action={removeAction} id={service.id} name={service.name} /> : null}
            />
          ))}
        </ul>
      )}

      {!canChange ? null : full ? (
        <p className="mt-8 text-sm text-ink-soft">You&rsquo;ve listed the most {words.many} one business can. Remove one to add another.</p>
      ) : (
        <section aria-labelledby="add-service-title" className="mt-10 border-t border-line pt-6">
          <h2 id="add-service-title" className="panel-section">
            {words.addHeading}
          </h2>
          <div className="mt-5">
            <ItemForm action={saveAction} submitLabel={words.addSubmit}>
              <ServiceFields service={null} nameField={words.nameField} itemWord={words.one} idPrefix="service-new" />
            </ItemForm>
          </div>
        </section>
      )}

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
