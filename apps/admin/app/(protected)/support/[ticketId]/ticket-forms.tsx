"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, type ReactElement } from "react";
import type { SupportTicket } from "@brandbasket/db";
import { canTransitionSupportStatus, SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { STAFF_SUPPORT_CATEGORY_LABELS, STAFF_SUPPORT_INITIAL_STATE, type StaffSupportActionState } from "@/lib/support-admin-state";
import { addMessage, linkError, unlinkError, updateTicket } from "./actions";

const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const capitalised = (value: string): string => `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;

/** The listed value a dropdown reported, or undefined when it is not one of them. */
function pick<T extends string>(values: readonly T[], chosen: string): T | undefined {
  return values.find((value) => value === chosen);
}

const CATEGORY_OPTIONS: readonly SelectOption[] = SUPPORT_CATEGORIES.map((value) => ({ value, label: STAFF_SUPPORT_CATEGORY_LABELS[value] }));
const PRIORITY_OPTIONS: readonly SelectOption[] = SUPPORT_PRIORITIES.map((value) => ({ value, label: capitalised(value) }));

function ActionNotice({ state }: { readonly state: StaffSupportActionState }): ReactElement | null {
  const router = useRouter();
  if (state.kind === "idle") return null;
  return <div role={state.kind === "saved" ? "status" : "alert"} className={`mt-4 text-sm ${state.kind === "saved" ? "text-ink-soft" : "text-accent"}`}>
    <p>{state.message}</p>
    {state.reference === undefined ? null : <p className="mt-2">Reference: <Link href={`/support/errors/${state.reference}`} className="break-all underline">{state.reference}</Link></p>}
    {state.kind === "conflict" ? <button className={`${buttonSecondary} mt-3`} type="button" onClick={() => router.refresh()}>Refresh ticket</button> : null}
  </div>;
}

export function TicketEditor({ ticket, staff }: { readonly ticket: SupportTicket; readonly staff: readonly { readonly userId: string; readonly name: string }[] }): ReactElement {
  const [status, setStatus] = useState(ticket.status);
  const [category, setCategory] = useState(ticket.category);
  const [priority, setPriority] = useState(ticket.priority);
  const [assignee, setAssignee] = useState(ticket.assigneeStaffId ?? "");
  const statusOptions = useMemo((): readonly SelectOption[] => SUPPORT_STATUSES.filter((value) => canTransitionSupportStatus(ticket.status, value)).map((value) => ({ value, label: SUPPORT_STATUS_LABELS[value] })), [ticket.status]);
  const assigneeOptions = useMemo((): readonly SelectOption[] => [{ value: "", label: "Unassigned" }, ...staff.map((person) => ({ value: person.userId, label: person.name }))], [staff]);
  const [state, action, pending] = useActionState(updateTicket.bind(null, ticket.id), STAFF_SUPPORT_INITIAL_STATE);
  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="expectedVersion" value={ticket.version} />
    <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
      <legend className="sr-only">Update this ticket</legend>
      <div><label htmlFor="ticket-status" className={labelClasses}>Status<RequiredMark /></label><SelectField id="ticket-status" name="status" required options={statusOptions} value={status} onChange={(value) => setStatus(pick(SUPPORT_STATUSES, value) ?? status)} aria-invalid={state.kind === "invalid" && state.field === "status"} className={fieldClasses} /></div>
      <div><label htmlFor="ticket-category" className={labelClasses}>Category<RequiredMark /></label><SelectField id="ticket-category" name="category" required options={CATEGORY_OPTIONS} value={category} onChange={(value) => setCategory(pick(SUPPORT_CATEGORIES, value) ?? category)} aria-invalid={state.kind === "invalid" && state.field === "category"} className={fieldClasses} /></div>
      <div><label htmlFor="ticket-priority" className={labelClasses}>Priority<RequiredMark /></label><SelectField id="ticket-priority" name="priority" required options={PRIORITY_OPTIONS} value={priority} onChange={(value) => setPriority(pick(SUPPORT_PRIORITIES, value) ?? priority)} aria-invalid={state.kind === "invalid" && state.field === "priority"} className={fieldClasses} /></div>
      <div><label htmlFor="ticket-assignee" className={labelClasses}>Assigned to</label><SelectField id="ticket-assignee" name="assigneeStaffId" options={assigneeOptions} value={assignee} onChange={setAssignee} aria-invalid={state.kind === "invalid" && state.field === "assigneeStaffId"} className={fieldClasses} /></div>
    </fieldset>
    <GatedSubmitButton className={`${buttonSecondary} mt-5`} pendingLabel="Saving…">Save changes</GatedSubmitButton>
    <ActionNotice state={state} />
  </form>;
}

export function TicketMessageForm({ ticketId, closed, submissionKey }: { readonly ticketId: string; readonly closed: boolean; readonly submissionKey: string }): ReactElement {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "internal">(closed ? "internal" : "public");
  const visibilityOptions = useMemo((): readonly SelectOption[] => [{ value: "public", label: "Public reply to requester", disabled: closed }, { value: "internal", label: "Internal note for staff" }], [closed]);
  const bound = addMessage.bind(null, ticketId);
  const [state, action, pending] = useActionState(async (previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> => {
    const next = await bound(previous, form);
    if (next.kind === "saved") setBody("");
    return next;
  }, STAFF_SUPPORT_INITIAL_STATE);
  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="submissionKey" value={state.submissionKey ?? submissionKey} />
    <div className="max-w-sm"><label htmlFor="message-visibility" className={labelClasses}>Who can see this<RequiredMark /></label><SelectField id="message-visibility" name="visibility" required options={visibilityOptions} value={visibility} onChange={(value) => setVisibility(value === "internal" ? "internal" : "public")} disabled={pending} className={fieldClasses} /></div>
    <p id="message-visibility-hint" className="mt-3 text-sm text-ink-soft">{visibility === "internal" ? "Only staff can see this note. It is never shown to the requester." : "This reply appears in the requester’s ticket conversation. No email or text message is sent."}</p>
    <div className="mt-5"><label htmlFor="message-body" className={labelClasses}>{visibility === "internal" ? "Internal note" : "Reply"}<RequiredMark /></label><textarea id="message-body" name="body" rows={6} minLength={1} maxLength={5000} required value={body} onChange={(event) => setBody(event.target.value)} disabled={pending} aria-describedby="message-visibility-hint" aria-invalid={state.kind === "invalid" && state.field === "body"} className={fieldClasses} /></div>
    <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Saving…">{visibility === "internal" ? "Save internal note" : "Add public reply"}</GatedSubmitButton>
    <ActionNotice state={state} />
  </form>;
}

export function ErrorLinkForm({ ticketId }: { readonly ticketId: string }): ReactElement {
  const [issueId, setIssueId] = useState("");
  const [state, action, pending] = useActionState(async (previous: StaffSupportActionState, form: FormData): Promise<StaffSupportActionState> => {
    const next = await linkError(ticketId, previous, form);
    if (next.kind === "saved") setIssueId("");
    return next;
  }, STAFF_SUPPORT_INITIAL_STATE);
  return <form action={action} aria-busy={pending} className="mt-6">
    <label htmlFor="automatic-issue-id" className={labelClasses}>Automatic error issue reference<RequiredMark /></label>
    <input id="automatic-issue-id" name="issueId" value={issueId} onChange={(event) => setIssueId(event.target.value)} required minLength={36} maxLength={36} pattern={UUID_PATTERN} title="The issue's 36-character UUID reference" spellCheck={false} autoCapitalize="none" autoComplete="off" disabled={pending} aria-invalid={state.kind === "invalid"} className={fieldClasses} placeholder="Paste the issue’s UUID reference" />
    <GatedSubmitButton className={`${buttonSecondary} mt-4`} pendingLabel="Linking…">Link privately</GatedSubmitButton>
    <ActionNotice state={state} />
  </form>;
}

export function RemoveErrorLink({ ticketId, issueId }: { readonly ticketId: string; readonly issueId: string }): ReactElement {
  const [state, action, pending] = useActionState(unlinkError.bind(null, ticketId), STAFF_SUPPORT_INITIAL_STATE);
  return <form action={action} aria-busy={pending}><input type="hidden" name="issueId" value={issueId} /><button type="submit" disabled={pending} className={buttonSecondary}>{pending ? "Removing…" : "Remove link"}</button><ActionNotice state={state} /></form>;
}
