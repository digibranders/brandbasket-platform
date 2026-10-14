import type { ReactElement } from "react";
import type { BusinessProduct } from "@firstfold/db";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { INPUT_CLASSES, ItemRow, Labelled, priceText, RemoveButton } from "@/components/panel/business/catalog-parts";
import { ItemForm } from "@/components/panel/business/item-form";
import { ProductPhotoControl } from "@/components/panel/business/product-photo-control";
import { ownProductPhotoHref } from "@/lib/photos-view";
import {
  CATALOG_MAX_ITEMS,
  ITEM_CATEGORY_MAX_LENGTH,
  ITEM_DESCRIPTION_MAX_LENGTH,
  ITEM_NAME_MAX_LENGTH,
  PRODUCT_AVAILABILITIES,
  PRODUCT_AVAILABILITY_LABELS,
} from "@/lib/business-profile-fields";
import { catalogWords } from "@/lib/catalog-words";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import type { ItemFormState } from "@/lib/item-form-state";
import { RenamedNote } from "@/components/panel/business/renamed-note";
import { WhereItShows } from "@/components/panel/where-it-shows";

/** Whole rupees: digits only. The server also reads "1,500" or "Rs 2499", which the keyboard filter no longer lets through. */
const PRICE_PATTERN = "[0-9]+";

const AVAILABILITY_OPTIONS: readonly SelectOption[] = PRODUCT_AVAILABILITIES.map((availability) => ({
  value: availability,
  label: PRODUCT_AVAILABILITY_LABELS[availability],
}));

interface ProductsTabProps {
  readonly products: readonly BusinessProduct[];
  /** What the owner calls this tab on their page ("Medicines"); null while it is "Products". */
  readonly label: string | null;
  /** False once staff have taken the business down: it can look but not change. */
  readonly canChange: boolean;
  readonly saveAction: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly removeAction: (formData: FormData) => Promise<void>;
  /** Takes a product's photo off it. */
  readonly removePhotoAction: (formData: FormData) => Promise<void>;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

interface ProductFieldsProps {
  readonly product: BusinessProduct | null;
  /** The label on the name field: "Product", or "Name" once the owner has named the tab. */
  readonly nameField: string;
  readonly idPrefix: string;
}

/** The sheet's product fields: name, description, price, category and availability. */
function ProductFields({ product, nameField, idPrefix }: ProductFieldsProps): ReactElement {
  const id = (field: string): string => `${idPrefix}-${field}`;
  return (
    <>
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Labelled id={id("name")} label={nameField} required>
          <input id={id("name")} name="name" required maxLength={ITEM_NAME_MAX_LENGTH} placeholder="Electric toothbrush" defaultValue={product?.name ?? ""} className={INPUT_CLASSES} />
        </Labelled>
        <Labelled id={id("category")} label="Group (optional)">
          <input id={id("category")} name="category" maxLength={ITEM_CATEGORY_MAX_LENGTH} placeholder="Oral care" defaultValue={product?.category ?? ""} className={INPUT_CLASSES} />
        </Labelled>
      </div>
      <Labelled id={id("description")} label="Description (optional)">
        <textarea
          id={id("description")}
          name="description"
          rows={2}
          maxLength={ITEM_DESCRIPTION_MAX_LENGTH}
          defaultValue={product?.description ?? ""}
          className={`${INPUT_CLASSES} resize-y`}
        />
      </Labelled>
      <div className="grid gap-5 sm:grid-cols-2">
        <Labelled id={id("price")} label="Price in ₹ (optional)">
          <RuleInput
            id={id("price")}
            name="price"
            rule="digits"
            maxLength={12}
            pattern={PRICE_PATTERN}
            title="Whole rupees, like 2499"
            placeholder="2499"
            defaultValue={product?.priceInr ?? ""}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
        </Labelled>
        <Labelled id={id("availability")} label="Availability" required>
          <SelectField
            id={id("availability")}
            name="availability"
            required
            options={AVAILABILITY_OPTIONS}
            defaultValue={product?.availability ?? "in_stock"}
            className={INPUT_CLASSES}
          />
        </Labelled>
      </div>
    </>
  );
}

function groupByCategory(products: readonly BusinessProduct[]): readonly (readonly [string | null, readonly BusinessProduct[]])[] {
  const groups = new Map<string | null, BusinessProduct[]>();
  for (const product of products) groups.set(product.category, [...(groups.get(product.category) ?? []), product]);
  return [...groups.entries()];
}

/**
 * The Products tab: what the business stocks, with price, group, availability and, from a product's edit sheet, a photo.
 * Optional; "Next" goes on to Photos.
 */
export function ProductsTab({ products, label, canChange, saveAction, removeAction, removePhotoAction, next }: ProductsTabProps): ReactElement {
  const full = products.length >= CATALOG_MAX_ITEMS;
  const words = catalogWords("products", label);
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-sm text-ink-soft">What you sell. Visitors see these on your page. Add a photo to {label === null ? "a product" : "an item"} by opening it with Edit.</p>
      {label === null ? null : <RenamedNote label={label} />}
      <div className="mt-1">
        <WhereItShows spot="products" caption={`Your ${words.many} show as cards, with their photos, in the ${words.tabName} column beside your page.`} />
      </div>

      {products.length === 0 ? null : (
        <div className="mt-6 space-y-8">
          {groupByCategory(products).map(([category, items]) => (
            <section key={category ?? "ungrouped"} aria-label={category ?? words.tabName}>
              {category === null ? null : <h2 className="panel-section">{category}</h2>}
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {items.map((product) => (
                  <ItemRow
                    key={product.id}
                    title={product.name}
                    facts={[priceText(product.priceInr), PRODUCT_AVAILABILITY_LABELS[product.availability]]}
                    lead={
                      product.photoId === null ? null : (
                        // eslint-disable-next-line @next/next/no-img-element -- the owner's own file, served by the app host
                        <img src={ownProductPhotoHref(product.photoId)} alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg object-cover" />
                      )
                    }
                    editForm={
                      canChange ? (
                        <div className="space-y-6">
                          <ProductPhotoControl productId={product.id} productName={product.name} photoId={product.photoId} removeAction={removePhotoAction} />
                          <ItemForm action={saveAction} submitLabel={words.saveSubmit}>
                            <ProductFields product={product} nameField={words.nameField} idPrefix={`product-${product.id}`} />
                          </ItemForm>
                        </div>
                      ) : null
                    }
                    removeForm={canChange ? <RemoveButton action={removeAction} id={product.id} name={product.name} /> : null}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!canChange ? null : full ? (
        <p className="mt-8 text-sm text-ink-soft">You&rsquo;ve listed the most {words.many} one business can. Remove one to add another.</p>
      ) : (
        <section aria-labelledby="add-product-title" className="mt-10 border-t border-line pt-6">
          <h2 id="add-product-title" className="panel-section">
            {words.addHeading}
          </h2>
          <div className="mt-5">
            <ItemForm action={saveAction} submitLabel={words.addSubmit}>
              <ProductFields product={null} nameField={words.nameField} idPrefix="product-new" />
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
