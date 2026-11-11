"use client";

import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { useActionState, useState } from "react";
import { Panel } from "@/components";
import type { ActionResult } from "@/lib/action-result";
import { Badge, Banner, Button, Dialog, DialogClose, Field, IconButton, LinkButton, Menu, MenuItem, Select, Textarea, useToast } from "@/ui";
import { useOpeningPayment } from "../../checkout/rules/opening-payment";
import { addServiceAction, cancelServiceAction } from "../actions";
import type { CancelOption, ServiceRowView, ServicesPanelView } from "../loader";
import { BILLING_REQUEST_HREF, REASON_LIMIT } from "../rules";

/*
 * Your services and Cancel a service (mock screens-c.js, Plan & billing; overlays.js, cancel). Each row says where the service
 * stands and offers its one action: Add (with what it costs today and a month), Keep for one that is ending, Cancel from the
 * row's menu. Only the owner sees the actions; the server checks again.
 */

const ADD_FORM = "billing-add-form";
const CANCEL_FORM = "billing-cancel-form";

function AddDialog({ row, onClose }: { readonly row: ServiceRowView & { readonly action: { readonly kind: "add"; readonly quote: string } }; readonly onClose: () => void }) {
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
      title={`Add ${row.name}`}
      footer={
        <>
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" form={ADD_FORM} variant="primary" pending={opening}>
            Add and pay
          </Button>
        </>
      }
    >
      <form id={ADD_FORM} action={action} className="flex flex-col gap-3">
        <input type="hidden" name="addOn" value={row.addOn} />
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        <p className="type-body text-ink">{row.action.quote}</p>
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

export function ServicesPanel({ view, preselect }: { readonly view: ServicesPanelView; readonly preselect: MonthlyAddOnId | null }) {
  const startAdd = view.rows.find((row) => row.addOn === preselect && row.action.kind === "add")?.addOn ?? null;
  const [adding, setAdding] = useState<MonthlyAddOnId | null>(startAdd);
  const [cancelling, setCancelling] = useState<MonthlyAddOnId | null>(null);
  const addRow = view.rows.find((row) => row.addOn === adding);
  const { cancel } = view;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Your services" flush>
        <ul className="divide-y divide-border-subtle">
          {view.rows.map((row) => (
            <li key={row.addOn} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="type-sub text-ink">{row.name}</b>
                <span className="type-meta">{row.line}</span>
                {row.action.kind === "note" ? (
                  <span className="type-meta">
                    {row.action.text}{" "}
                    {row.action.ask ? (
                      <LinkButton href={BILLING_REQUEST_HREF} size="sm" variant="ghost">
                        Ask the team
                      </LinkButton>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <Badge tone={row.status.tone}>{row.status.word}</Badge>
              <span className="type-sub text-ink tabular-nums">{row.price}</span>
              <RowAction row={row} onAdd={() => setAdding(row.addOn)} onCancel={() => setCancelling(row.addOn)} />
            </li>
          ))}
        </ul>
      </Panel>
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
