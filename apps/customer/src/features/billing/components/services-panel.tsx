"use client";

import { MONITORING_ID, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { useActionState, useState } from "react";
import { Panel, ServiceMark } from "@/components";
import type { ActionResult } from "@/lib/action-result";
import { Badge, Banner, Button, Dialog, DialogClose, Field, IconButton, LinkButton, Menu, MenuItem, Select, Textarea, useToast } from "@/ui";
import { PaymentSummaryBody } from "../../checkout/components/confirm-payment";
import { useOpeningPayment } from "../../checkout/rules/opening-payment";
import { addServiceAction, cancelServiceAction } from "../actions";
import type { CancelOption, ServiceAction, ServiceRowView, ServicesPanelView } from "../loader";
import { BILLING_REQUEST_HREF, REASON_LIMIT } from "../rules";

/*
 * Your services and Cancel a service (Plan & billing, direction A in docs/customer-app-v4/mock/billing-options.html; overlays.js,
 * cancel). Each service is a tile that says where it stands and offers its one action: Add (its dialog shows what is paid today and
 * what follows; a service on the first-month offer shows its ₹1 price), Keep for one that is ending, Cancel from the tile's menu.
 * Only the owner sees the actions; the server checks again.
 */

const ADD_FORM = "billing-add-form";
const CANCEL_FORM = "billing-cancel-form";

function AddDialog({ row, onClose }: { readonly row: ServiceRowView & { readonly action: Extract<ServiceAction, { kind: "add" }> }; readonly onClose: () => void }) {
  const toast = useToast();
  const [state, action, pending] = useActionState(async (previous: ActionResult | null, formData: FormData) => {
    const result = await addServiceAction(previous, formData);
    if (result.ok) {
      toast(`${row.name} is on.`);
      onClose();
    }
    return result;
  }, null);
  const opening = useOpeningPayment(pending, state);
  const failure = state !== null && !state.ok && !pending ? state : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={row.action.summary.title}
      footer={
        <>
          <DialogClose>
            <Button>Go back</Button>
          </DialogClose>
          <Button type="submit" form={ADD_FORM} variant="primary" pending={opening}>
            {`Pay ${row.action.summary.total}`}
          </Button>
        </>
      }
    >
      <form id={ADD_FORM} action={action} className="flex flex-col gap-3">
        <input type="hidden" name="addOn" value={row.addOn} />
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        <PaymentSummaryBody summary={row.action.summary} />
      </form>
    </Dialog>
  );
}

function KeepButton({ row }: { readonly row: ServiceRowView }) {
  const toast = useToast();
  const [, action, pending] = useActionState(async (previous: ActionResult | null, formData: FormData) => {
    const result = await addServiceAction(previous, formData);
    toast(result.ok ? `${row.name} stays. Your monthly payment does not change.` : result.message);
    return result;
  }, null);
  return (
    <form action={action}>
      <input type="hidden" name="addOn" value={row.addOn} />
      <Button type="submit" size="sm" pending={pending}>
        Keep
      </Button>
    </form>
  );
}

function CancelDialog({ options, endsOn, initial, onClose }: { readonly options: readonly CancelOption[]; readonly endsOn: string; readonly initial: MonthlyAddOnId; readonly onClose: () => void }) {
  const toast = useToast();
  const [state, action, pending] = useActionState(async (previous: ActionResult<{ message: string }> | null, formData: FormData) => {
    const result = await cancelServiceAction(previous, formData);
    if (result.ok) {
      toast(result.data?.message ?? `Cancellation scheduled for ${endsOn}`);
      onClose();
    }
    return result;
  }, null);
  const [chosen, setChosen] = useState<MonthlyAddOnId>(initial);
  const option = options.find((candidate) => candidate.addOn === chosen) ?? options[0];
  const failure = state !== null && !state.ok && !pending ? state : null;
  if (option === undefined) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Cancel a service"
      footer={
        <>
          <DialogClose>
            <Button>Keep my plan</Button>
          </DialogClose>
          <Button type="submit" form={CANCEL_FORM} variant="danger" pending={pending}>
            {`Cancel from ${endsOn}`}
          </Button>
        </>
      }
    >
      <form id={CANCEL_FORM} action={action} className="flex flex-col gap-4">
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        <Banner tone="warn">
          <strong className="font-semibold">Here is what happens.</strong> The service stays active until your next billing date, {endsOn}.
          {option.copy.websiteOffline === null ? null : ` ${option.copy.websiteOffline}`}
        </Banner>
        <Field label="Which service?" nativeLabel={false} error={failure?.fieldErrors?.addOn}>
          <Select name="addOn" aria-label="Which service?" options={options.map((candidate) => ({ value: candidate.addOn, label: candidate.name }))} value={option.addOn} onValueChange={(next) => setChosen((next ?? option.addOn) as MonthlyAddOnId)} />
        </Field>
        <Field label="Why are you leaving? (optional)" name="reason" error={failure?.fieldErrors?.reason}>
          <Textarea name="reason" maxLength={REASON_LIMIT} />
        </Field>
        <p className="type-meta">
          {option.copy.keeps} {option.copy.monthly}
          {option.copy.packageEnds === null ? null : ` ${option.copy.packageEnds}`}
        </p>
      </form>
    </Dialog>
  );
}

function RowAction({ row, onAdd, onCancel }: { readonly row: ServiceRowView; readonly onAdd: () => void; readonly onCancel: () => void }) {
  switch (row.action.kind) {
    case "add":
      return (
        <Button size="sm" onClick={onAdd}>
          Add
        </Button>
      );
    case "keep":
      return <KeepButton row={row} />;
    case "cancel":
      return (
        <Menu align="end" trigger={<IconButton icon="DotsThree" label={`Options for ${row.name}`} />}>
          <MenuItem tone="danger" onClick={onCancel}>
            Cancel this service
          </MenuItem>
        </Menu>
      );
    case "note":
    case "none":
      return null;
    default: {
      const unhandled: never = row.action;
      throw new Error(`Unhandled service action: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** How many of the three plans are on, toward monitoring at no cost: a bar per plan, filled for each one held. */
function PlansHeld({ held, total }: { readonly held: number; readonly total: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1" role="img" aria-label={`${held} of ${total} plans`}>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-mark ${index < held ? "bg-primary" : "bg-neutral-wash"}`} />
        ))}
      </div>
      <span className="type-meta">{`You have ${held} of ${total} plans.`}</span>
    </div>
  );
}

export function ServicesPanel({ view, preselect }: { readonly view: ServicesPanelView; readonly preselect: MonthlyAddOnId | null }) {
  const startAdd = view.rows.find((row) => row.addOn === preselect && row.action.kind === "add")?.addOn ?? null;
  const [adding, setAdding] = useState<MonthlyAddOnId | null>(startAdd);
  const [cancelling, setCancelling] = useState<MonthlyAddOnId | null>(null);
  const addRow = view.rows.find((row) => row.addOn === adding);
  const { cancel } = view;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="billing-services" className="flex flex-col gap-3">
        <h2 id="billing-services" className="type-section text-ink">
          Your services
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.rows.map((row) => {
            const on = row.status.word !== "Not added";
            const tile = on ? "border-pos-border bg-surface" : row.offerPrice !== null ? "border-accent-border bg-accent-wash" : "border-border bg-surface";
            return (
              <li key={row.addOn} className={`flex flex-col gap-2 rounded-panel border p-4 sm:min-h-44 ${tile}`}>
                <div className="flex items-start gap-2">
                  {row.service === null ? null : <ServiceMark service={row.service} bought={on} className="mt-1.5" />}
                  <b className="type-sub min-w-0 flex-1 text-ink">{row.name}</b>
                  {row.offerPrice === null ? <Badge tone={row.status.tone}>{row.status.word}</Badge> : <Badge tone="accent">{`${row.offerPrice} first month`}</Badge>}
                </div>
                <p className="type-meta flex-1">{row.line}</p>
                {row.action.kind === "note" ? (
                  <p className="type-meta">
                    {row.action.text}{" "}
                    {row.action.ask ? (
                      <LinkButton href={BILLING_REQUEST_HREF} size="sm" variant="ghost">
                        Ask the team
                      </LinkButton>
                    ) : null}
                  </p>
                ) : null}
                {row.addOn === MONITORING_ID && !on && view.glance !== null ? <PlansHeld held={view.glance.plansHeld} total={view.glance.plansTotal} /> : null}
                <div className="flex items-center justify-between gap-2">
                  {row.offerPrice === null ? (
                    <span className="type-sub tabular-nums text-ink">{row.price}</span>
                  ) : (
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="type-sub text-ink">{row.offerPrice}</span>
                      <span className="type-meta">
                        <span className="sr-only">usually </span>
                        <s>{row.price}</s>
                      </span>
                    </span>
                  )}
                  <RowAction row={row} onAdd={() => setAdding(row.addOn)} onCancel={() => setCancelling(row.addOn)} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {cancel === null ? null : (
        <Panel title="Cancel a service">
          <p className="type-body text-ink-3">You can remove a service from your next billing date. Your website stays live until then. Ad campaigns stop on the same day.</p>
          <div className="mt-3">
            <Button variant="danger" onClick={() => setCancelling(cancel.options[0]?.addOn ?? null)}>
              Cancel a service
            </Button>
          </div>
        </Panel>
      )}
      {addRow !== undefined && addRow.action.kind === "add" ? <AddDialog row={{ ...addRow, action: addRow.action }} onClose={() => setAdding(null)} /> : null}
      {cancel === null || cancelling === null ? null : <CancelDialog options={cancel.options} endsOn={cancel.endsOn} initial={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}
