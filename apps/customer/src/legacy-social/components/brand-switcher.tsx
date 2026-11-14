"use client";

import { PencilSimple, X } from "@phosphor-icons/react/dist/ssr";
import { Select } from "@/ui";
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { addBrandAction, archiveBrandAction, renameBrandAction, renameFirstBrandAction, selectBrandAction } from "@/legacy-social/brand-actions";
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
  const rename = useReviewAction();
  const [name, setName] = useState("");
  /** The brand being renamed, and the name being written for it. */
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly draft: string } | null>(null);
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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),30rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-dialog backdrop:bg-scrim"
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
            <li key={brand.externalId} className="grid gap-2 rounded-xl bg-sunken px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block break-words text-[0.875rem] font-semibold text-ink">{brand.name}</span>
                  <span className="block text-xs text-ink-2">{brand.archived ? "Archived, nothing is sent for it" : brand.externalId === current ? "Looking at this one" : (brand.website ?? "No website yet")}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <button type="button" disabled={rename.pending} onClick={() => setRenaming({ id: brand.externalId, draft: brand.name })} className={SMALL_SOFT}>
                    Rename
                  </button>
                  {brand.archived ? (
                    <button type="button" disabled={archive.pending || !canAdd} onClick={() => archive.run(archiveBrandAction, { brand: brand.externalId, archived: "false" })} className={SMALL_SOFT}>
                      Bring back
                    </button>
                  ) : live > 1 ? (
                    <button type="button" disabled={archive.pending} onClick={() => archive.run(archiveBrandAction, { brand: brand.externalId, archived: "true" })} className={SMALL_SOFT}>
                      Archive
                    </button>
                  ) : null}
                </span>
              </div>
              {renaming?.id === brand.externalId ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (rename.pending || renaming.draft.trim() === "") return;
                    rename.run(renameBrandAction, { brand: brand.externalId, name: renaming.draft }, () => setRenaming(null));
                  }}
                  className="grid gap-2"
                >
                  <label htmlFor={`rename-${brand.externalId}`} className="text-xs font-semibold text-ink-2">
                    New name
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input id={`rename-${brand.externalId}`} type="text" value={renaming.draft} onChange={(event) => setRenaming({ id: brand.externalId, draft: event.target.value })} maxLength={80} className={`${FIELD} min-w-0 flex-1`} />
                    <button type="submit" disabled={rename.pending || renaming.draft.trim() === ""} className={SMALL_DARK}>
                      {rename.pending ? "Saving" : "Save"}
                    </button>
                    <button type="button" disabled={rename.pending} onClick={() => setRenaming(null)} className={SMALL_SOFT}>
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-ink-3">The name shows here and to our team. Pictures and captions keep the name written on your website.</p>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {(rename.error ?? archive.error) === null ? null : (
          <p role="alert" className="text-[0.84375rem] font-semibold text-error">
            {rename.error ?? archive.error}
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

/** The brand's name, plain, with a quiet pencil beside it to rename it. */
function BrandChip({ name, onRename }: { readonly name: string; readonly onRename: () => void }): ReactElement {
  return (
    <span className="inline-flex max-w-64 items-center gap-1 pr-1">
      <span className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">{name}</span>
      <button type="button" onClick={onRename} aria-label="Rename" title="Rename" className="grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ink">
        <PencilSimple size={14} weight="regular" aria-hidden="true" />
      </button>
    </span>
  );
}

/**
 * Which brand the customer is looking at, and where she manages them. With one live brand and no more allowed, it is the brand's name and
 * a way to rename it; with room for more, a choice of brand and the window to add, rename and archive.
 */
export function BrandSwitcher({ view, current }: BrandSwitcherProps): ReactElement | null {
  const select = useReviewAction();
  const [managing, setManaging] = useState(false);
  const live = view.brands.filter((brand) => !brand.archived);
  // One live brand and no room for another: nothing to choose, so the brand's name is shown with the way to rename it.
  if (view.allowed <= 1 && live.length <= 1) {
    return (
      <>
        <BrandChip name={live[0]?.name ?? ""} onRename={() => setManaging(true)} />
        {managing ? <ManageBrands view={view} current={current} onClose={() => setManaging(false)} /> : null}
      </>
    );
  }
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
        className="w-40 h-8! text-[0.8125rem]"
      />
      <button type="button" onClick={() => setManaging(true)} className={SMALL_SOFT}>
        Add brands
      </button>
      {managing ? <ManageBrands view={view} current={current} onClose={() => setManaging(false)} /> : null}
    </>
  );
}

/**
 * The brand's name before the posting service has a workspace for it: the business's own name, with a way to write another. The first
 * save opens the brand there. Once it exists the page shows it through BrandSwitcher instead.
 */
function FirstBrandName({ name }: { readonly name: string }): ReactElement {
  const save = useReviewAction();
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <>
        <BrandChip name={name} onRename={() => setDraft(name)} />
      </>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (save.pending || draft.trim() === "") return;
        save.run(renameFirstBrandAction, { name: draft }, () => setDraft(null));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input aria-label="Brand name" type="text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} className={`${FIELD} w-52`} />
      <button type="submit" disabled={save.pending || draft.trim() === ""} className={SMALL_DARK}>
        {save.pending ? "Saving" : "Save"}
      </button>
      <button type="button" disabled={save.pending} onClick={() => setDraft(null)} className={SMALL_SOFT}>
        Cancel
      </button>
      {save.error === null ? null : (
        <p role="alert" className="w-full text-[0.84375rem] font-semibold text-error">
          {save.error}
        </p>
      )}
    </form>
  );
}

/** The brand control of the Social screens: the choice of brand when the posting service lists them, else the business's name to rename (also when the service has no brand of it yet). */
export function BrandControl({ view, current, name }: { readonly view: BrandsView | null; readonly current: string; readonly name: string }): ReactElement {
  // A business the posting service has not met, or one it knows with no brand yet, shows its own name until the first save.
  return view === null || view.brands.length === 0 ? <FirstBrandName name={name} /> : <BrandSwitcher view={view} current={current} />;
}
