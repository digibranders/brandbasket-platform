"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { Select } from "@/ui";
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { addBrandAction, archiveBrandAction, selectBrandAction } from "@/legacy-social/brand-actions";
import type { BrandsView } from "@/features/social/brands";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

const FIELD = "h-10 w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink placeholder:text-ink-3";

interface BrandSwitcherProps {
  readonly view: BrandsView;
  /** The workspace id of the brand being looked at. */
  readonly current: string;
}

/** The window to add a brand, and to archive one or bring it back. Exported for its test. */
export function ManageBrands({ view, current, onClose }: BrandSwitcherProps & { readonly onClose: () => void }): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const add = useReviewAction();
  const archive = useReviewAction();
  const [name, setName] = useState("");
  const canAdd = view.used < view.allowed;
  const live = view.brands.filter((brand) => !brand.archived).length;

  useEffect(() => {
    const window = dialog.current;
    if (window !== null && !window.open) window.showModal();
  }, []);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (add.pending || name.trim() === "") return;
    add.run(addBrandAction, { name }, () => {
      setName("");
      onClose();
    });
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="manage-brands-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),30rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="manage-brands-title" className="type-section text-ink">
              Your brands
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">
              {view.used} of {view.allowed} in use. Each brand has its own website, posts, pictures and accounts.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <ul className="grid gap-2">
          {view.brands.map((brand) => (
            <li key={brand.externalId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken px-3 py-2">
              <span className="min-w-0">
                <span className="block break-words text-[0.875rem] font-semibold text-ink">{brand.name}</span>
                <span className="block text-xs text-ink-2">{brand.archived ? "Archived, nothing is sent for it" : brand.externalId === current ? "Looking at this one" : (brand.website ?? "No website yet")}</span>
              </span>
              {brand.archived ? (
                <button type="button" disabled={archive.pending || !canAdd} onClick={() => archive.run(archiveBrandAction, { brand: brand.externalId, archived: "false" })} className={SMALL_SOFT}>
                  Bring back
                </button>
              ) : live > 1 ? (
                <button type="button" disabled={archive.pending} onClick={() => archive.run(archiveBrandAction, { brand: brand.externalId, archived: "true" })} className={SMALL_SOFT}>
                  Archive
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {archive.error === null ? null : (
          <p role="alert" className="text-[0.84375rem] font-semibold text-error">
            {archive.error}
          </p>
        )}

        {canAdd ? (
          <form onSubmit={submit} className="grid gap-2 border-t border-line pt-4">
            <label htmlFor="new-brand-name" className="text-xs font-semibold text-ink-2">
              Add a brand
            </label>
            <div className="flex flex-wrap gap-2">
              <input id="new-brand-name" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="The brand's name" className={`${FIELD} min-w-0 flex-1`} />
              <button type="submit" disabled={add.pending || name.trim() === ""} className={SMALL_DARK}>
                {add.pending ? "Adding" : "Add brand"}
              </button>
            </div>
            {add.error === null ? null : (
              <p role="alert" className="text-[0.84375rem] font-semibold text-error">
                {add.error}
              </p>
            )}
          </form>
        ) : (
          <p className="border-t border-line pt-4 text-[0.84375rem] text-ink-2">You have as many brands as your plan allows. Archive one to add another, or ask us to allow more.</p>
        )}
        <p className="text-xs text-ink-3">Archiving keeps everything and stops anything new from being sent or drawn for that brand.</p>
      </div>
    </dialog>
  );
}

/**
 * Which brand the customer is looking at, and where she manages them. Shown only when the business may have more than one, or has more than
 * one that is live: with one live brand and no more allowed, nothing changes for her.
 */
export function BrandSwitcher({ view, current }: BrandSwitcherProps): ReactElement | null {
  const select = useReviewAction();
  const [managing, setManaging] = useState(false);
  const live = view.brands.filter((brand) => !brand.archived);
  // One live brand and no room for another: nothing to choose, and an archived one cannot come back, so nothing is shown.
  if (view.allowed <= 1 && live.length <= 1) return null;
  return (
    <>
      <Select
        aria-label="Brand"
        value={current}
        disabled={select.pending}
        onValueChange={(next) => {
          if (next !== null && next !== current) select.run(selectBrandAction, { brand: next });
        }}
        options={live.map((brand) => ({ value: brand.externalId, label: brand.name }))}
        className="w-52"
      />
      <button type="button" onClick={() => setManaging(true)} className={SMALL_SOFT}>
        Brands
      </button>
      {managing ? <ManageBrands view={view} current={current} onClose={() => setManaging(false)} /> : null}
    </>
  );
}
