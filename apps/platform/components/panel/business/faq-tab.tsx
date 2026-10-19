import type { ReactElement } from "react";
import type { BusinessFaq } from "@brandbasket/db";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { INPUT_CLASSES, ItemRow, Labelled, RemoveButton } from "@/components/panel/business/catalog-parts";
import { ItemForm } from "@/components/panel/business/item-form";
import { FAQ_ANSWER_MAX_LENGTH, FAQ_MAX_ITEMS, FAQ_QUESTION_MAX_LENGTH } from "@/lib/business-profile-fields";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import type { ItemFormState } from "@/lib/item-form-state";

interface FaqTabProps {
  readonly faqs: readonly BusinessFaq[];
  /** False once staff have taken the business down: it can look but not change. */
  readonly canChange: boolean;
  readonly saveAction: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly removeAction: (formData: FormData) => Promise<void>;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

interface FaqFieldsProps {
  readonly faq: BusinessFaq | null;
  /** Keeps ids unique where the form appears once per question. */
  readonly idPrefix: string;
}

/** A question and its answer. */
function FaqFields({ faq, idPrefix }: FaqFieldsProps): ReactElement {
  const id = (field: string): string => `${idPrefix}-${field}`;
  return (
    <>
      <input type="hidden" name="id" value={faq?.id ?? ""} />
      <Labelled id={id("question")} label="Question" required>
        <input
          id={id("question")}
          name="question"
          required
          maxLength={FAQ_QUESTION_MAX_LENGTH}
          placeholder="Do you take walk-ins?"
          defaultValue={faq?.question ?? ""}
          className={INPUT_CLASSES}
        />
      </Labelled>
      <Labelled id={id("answer")} label="Answer" required>
        <textarea
          id={id("answer")}
          name="answer"
          required
          rows={3}
          maxLength={FAQ_ANSWER_MAX_LENGTH}
          placeholder="Yes. No booking needed before 6 pm."
          defaultValue={faq?.answer ?? ""}
          className={`${INPUT_CLASSES} resize-y`}
        />
      </Labelled>
    </>
  );
}

/**
 * The FAQ tab: the questions customers ask, with the owner's answers, shown on the public page's FAQ tab. Optional;
 * the first question saved switches that tab on. "Next" goes on to Photos.
 */
export function FaqTab({ faqs, canChange, saveAction, removeAction, next }: FaqTabProps): ReactElement {
  const full = faqs.length >= FAQ_MAX_ITEMS;
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-sm text-ink-soft">The questions your customers keep asking, answered once. Visitors read them on your page.</p>

      {faqs.length === 0 ? null : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {faqs.map((faq) => (
            <ItemRow
              key={faq.id}
              title={faq.question}
              facts={[]}
              editForm={
                canChange ? (
                  <ItemForm action={saveAction} submitLabel="Save question">
                    <FaqFields faq={faq} idPrefix={`faq-${faq.id}`} />
                  </ItemForm>
                ) : null
              }
              removeForm={canChange ? <RemoveButton action={removeAction} id={faq.id} name={faq.question} /> : null}
            />
          ))}
        </ul>
      )}

      {!canChange ? null : full ? (
        <p className="mt-8 text-sm text-ink-soft">You&rsquo;ve added the most questions one business can. Remove one to add another.</p>
      ) : (
        <section aria-labelledby="add-faq-title" className="mt-10 border-t border-line pt-6">
          <h2 id="add-faq-title" className="panel-section">
            Add a question
          </h2>
          <div className="mt-5">
            <ItemForm action={saveAction} submitLabel="Add question">
              <FaqFields faq={null} idPrefix="faq-new" />
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
