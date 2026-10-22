import type { ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { buttonDanger, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, hintClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { StatusDot } from "@/components/console/status-dot";
import { ADD_ON_NOTICES, addOnNoticeText, type AddOnNotice } from "@/lib/add-on-notices";
import { removeHint, type ClientAddOnOption, type ClientAddOnRow, type ClientBundledAddOnRow, type ClientPressReleaseRow, type PressReleaseStatus } from "@/lib/client-add-ons";
import {
  addClientAddOnAction,
  endAddOnAction,
  markAddOnContactedAction,
  markBundledAddOnContactedAction,
  removeClientAddOnAction,
  retryAddOnProviderAction,
  setPressReleaseStatusAction,
} from "@/app/(protected)/clients/[businessId]/actions";

const STEP_BUTTONS: Readonly<Record<Exclude<PressReleaseStatus, "waiting">, string>> = {
  in_progress: "Mark in progress",
  published: "Mark published",
};

/** The same small-button size the Directory rows use, so a row of actions stays compact. */
const ROW_BUTTON = "!px-4 !py-2";

interface EndFormProps {
  readonly businessId: string;
  readonly row: ClientAddOnRow;
  readonly kind: "cancel" | "pause";
}

/**
 * Pause or Cancel, behind a native disclosure with the console's confirm rule: a required first-person box that names the
 * add-on and the date, then a danger button named for what it does. It works without JavaScript, and the summary reads
 * "Never mind" while it is open.
 */
function EndForm({ businessId, row, kind }: EndFormProps): ReactElement {
  const verb = kind === "cancel" ? "Cancel" : "Pause";
  const outcome = kind === "cancel" ? "stop" : "pause";
  return (
    <details className="group open:basis-full">
      <summary className={`${buttonSecondary} ${ROW_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">
          {verb}
          <span className="sr-only"> {row.title}</span>
        </span>
        <span className="hidden group-open:inline">Never mind</span>
      </summary>
      <form action={endAddOnAction} className="mt-4 max-w-md space-y-3">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="addOnSubscriptionId" value={row.id} />
        <input type="hidden" name="kind" value={kind} />
        <label className="flex items-start gap-3 text-sm font-medium">
          <input type="checkbox" name="confirm" value="yes" required className={checkboxClasses} />
          <span>
            I’ve told the customer. {row.title} will {outcome} on {row.endsOnText}.
            <RequiredMark />
          </span>
        </label>
        <p className={hintClasses}>
          This happens at the next billing date, the same as when the customer does it. They are not charged again after it.
        </p>
        <GatedSubmitButton className={`${buttonDanger} ${ROW_BUTTON}`}>
          {verb} {row.title}
        </GatedSubmitButton>
      </form>
    </details>
  );
}

function AddOnRow({ businessId, row }: { readonly businessId: string; readonly row: ClientAddOnRow }): ReactElement {
  const showActions = row.needsContact || row.canEnd;
  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">{row.title}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{row.price}</p>
          {row.dateLine === null ? null : <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{row.dateLine}</p>}
          {row.endNote === null ? null : <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{row.endNote}</p>}
          {row.contactedOn === null ? null : <p className="mt-0.5 text-sm tabular-nums text-ink-soft">Contacted on {row.contactedOn}</p>}
        </div>
        <StatusDot tone={row.state.tone} label={row.state.label} />
      </div>
      {showActions ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {row.needsContact ? (
            <form action={markAddOnContactedAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="addOnSubscriptionId" value={row.id} />
              <button type="submit" className={`${buttonSecondary} ${ROW_BUTTON}`}>
                Mark contacted
                <span className="sr-only"> for {row.title}</span>
              </button>
            </form>
          ) : null}
          {row.canEnd ? (
            <>
              <EndForm businessId={businessId} row={row} kind="pause" />
              <EndForm businessId={businessId} row={row} kind="cancel" />
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

interface ConfirmFormProps {
  readonly opener: string;
  readonly action: (formData: FormData) => Promise<void>;
  readonly fields: Readonly<Record<string, string>>;
  readonly confirm: string;
  readonly hint: string;
  readonly submit: string;
  readonly danger: boolean;
}

/** A change behind the console's confirm rule, as Pause and Cancel are: a required first-person box, then a button named for it. */
function ConfirmForm({ opener, action, fields, confirm, hint, submit, danger }: ConfirmFormProps): ReactElement {
  return (
    <details className="group open:basis-full">
      <summary className={`${buttonSecondary} ${ROW_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">{opener}</span>
        <span className="hidden group-open:inline">Never mind</span>
      </summary>
      <form action={action} className="mt-4 max-w-md space-y-3">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="flex items-start gap-3 text-sm font-medium">
          <input type="checkbox" name="confirm" value="yes" required className={checkboxClasses} />
          <span>
            {confirm}
            <RequiredMark />
          </span>
        </label>
        <p className={hintClasses}>{hint}</p>
        <GatedSubmitButton className={`${danger ? buttonDanger : buttonSecondary} ${ROW_BUTTON}`}>{submit}</GatedSubmitButton>
      </form>
    </details>
  );
}

/** An add-on billed in the plan's payment: taken out from the next billing date, never paused or cancelled on its own. */
function BundledAddOnRow({ businessId, row }: { readonly businessId: string; readonly row: ClientBundledAddOnRow }): ReactElement {
  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">{row.title}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{row.price}</p>
          {row.dateLine === null ? null : <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{row.dateLine}</p>}
          {row.contactedOn === null ? null : <p className="mt-0.5 text-sm tabular-nums text-ink-soft">Contacted on {row.contactedOn}</p>}
        </div>
        <StatusDot tone={row.state.tone} label={row.state.label} />
      </div>
      {row.needsContact || row.canRetry || (row.canRemove && row.endsOnText !== null) ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {row.needsContact ? (
            <form action={markBundledAddOnContactedAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="bundledAddOnId" value={row.id} />
              <button type="submit" className={`${buttonSecondary} ${ROW_BUTTON}`}>
                Mark contacted
                <span className="sr-only"> for {row.title}</span>
              </button>
            </form>
          ) : null}
          {row.canRetry ? (
            <form action={retryAddOnProviderAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="bundledAddOnId" value={row.id} />
              <button type="submit" className={`${buttonSecondary} ${ROW_BUTTON}`}>
                Retry the provider
                <span className="sr-only"> for {row.title}</span>
              </button>
            </form>
          ) : null}
          {row.canRemove && row.endsOnText !== null ? (
            <ConfirmForm
              opener={`Remove ${row.title}`}
              action={removeClientAddOnAction}
              fields={{ businessId, addOn: row.addOn }}
              confirm={`I’ve told the customer. ${row.title} will stop on ${row.endsOnText}.`}
              hint={removeHint(row.addOn, row.endsOnText)}
              submit={`Remove ${row.title}`}
              danger
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Add (or keep) an add-on for the client, with what it costs. The customer pays the charge themselves, from Billing. */
function AddOnOptions({ businessId, options }: { readonly businessId: string; readonly options: readonly ClientAddOnOption[] }): ReactElement {
  return (
    <div className="mt-6 flex flex-wrap items-start gap-3">
      {options.map((option) => (
        <ConfirmForm
          key={option.addOn}
          opener={`${option.kind === "keep" ? "Keep" : "Add"} ${option.title}`}
          action={addClientAddOnAction}
          fields={{ businessId, addOn: option.addOn }}
          confirm={
            option.kind === "keep"
              ? `I’ve told the customer. ${option.title} stays in their plan payment.`
              : `I’ve told the customer. They pay for ${option.title} from Billing, and it turns on when they do.`
          }
          hint={option.costText}
          submit={`${option.kind === "keep" ? "Keep" : "Add"} ${option.title}`}
          danger={false}
        />
      ))}
    </div>
  );
}

function PressReleaseRow({ businessId, release }: { readonly businessId: string; readonly release: ClientPressReleaseRow }): ReactElement {
  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">Press release</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{release.amount}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-soft">Bought on {release.boughtOn}</p>
        </div>
        <StatusDot tone={release.state.tone} label={release.state.label} />
      </div>
      {release.nextSteps.length === 0 ? null : (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {release.nextSteps.map((step) => (
            <form key={step} action={setPressReleaseStatusAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="pressReleaseId" value={release.id} />
              <input type="hidden" name="status" value={step} />
              <button type="submit" className={`${buttonSecondary} ${ROW_BUTTON}`}>
                {STEP_BUTTONS[step]}
              </button>
            </form>
          ))}
        </div>
      )}
    </li>
  );
}

interface ClientAddOnsProps {
  readonly businessId: string;
  readonly addOns: readonly ClientAddOnRow[];
  readonly bundledAddOns: readonly ClientBundledAddOnRow[];
  readonly pressReleases: readonly ClientPressReleaseRow[];
  readonly options: readonly ClientAddOnOption[];
  readonly notice: AddOnNotice | null;
  /** The day the client's kept plan starts, when one is waiting: what the plan-kept notice says. */
  readonly keptStartsOn: string | null;
}

/**
 * The client page's Add-ons section: each add-on subscription the customer bought (state, price paid, next billing or end
 * date, who scheduled an end) and each press release with its status. Staff follow up a new purchase, pause or cancel
 * for the customer, and move a press release on. The id lets the Journey and every notice link land here.
 */
export function ClientAddOns({ businessId, addOns, bundledAddOns, pressReleases, options, notice, keptStartsOn }: ClientAddOnsProps): ReactElement {
  const toFollowUp =
    addOns.filter((row) => row.needsContact).length + bundledAddOns.filter((row) => row.needsContact).length + pressReleases.filter((release) => release.status === "waiting").length;
  return (
    <Section id="add-ons" title="Add-ons" aside={toFollowUp === 0 ? "Bought by the customer" : `${toFollowUp} to follow up`}>
      {notice === null ? null : (
        <Notice tone={ADD_ON_NOTICES[notice].ok ? "ok" : "problem"} className="mb-6">
          {addOnNoticeText(notice, keptStartsOn)}
        </Notice>
      )}
      {addOns.length === 0 && bundledAddOns.length === 0 && pressReleases.length === 0 ? (
        <Quiet>Nothing bought yet. Services appear here when the customer takes one.</Quiet>
      ) : (
        <ul className="max-w-3xl divide-y divide-line">
          {addOns.map((row) => (
            <AddOnRow key={row.id} businessId={businessId} row={row} />
          ))}
          {bundledAddOns.map((row) => (
            <BundledAddOnRow key={row.id} businessId={businessId} row={row} />
          ))}
          {pressReleases.map((release) => (
            <PressReleaseRow key={release.id} businessId={businessId} release={release} />
          ))}
        </ul>
      )}
      {options.length === 0 ? null : <AddOnOptions businessId={businessId} options={options} />}
    </Section>
  );
}
