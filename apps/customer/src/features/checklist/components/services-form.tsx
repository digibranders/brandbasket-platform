"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@/ui";
import { saveServicesItem } from "../actions";
import { MAX_REFERENCE_URLS, MAX_SERVICES } from "../rules-content";
import { FormField, ItemForm } from "./item-form";
import { SectionLabel } from "./section-label";

export interface ServiceRow {
  /** The saved service this row edits; "" for a new one. */
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly price: string;
}

export interface ServicesFormProps {
  readonly services: readonly ServiceRow[];
  readonly notesForBuilder: string;
  readonly styleLikes: string;
  readonly referenceUrls: readonly string[];
  readonly readOnlyReason: string | null;
}

interface KeyedRow extends ServiceRow {
  /** Stable across removals, so a row keeps what was typed in it. Also the number the form field names use. */
  readonly index: number;
}

export function ServicesForm({ services, notesForBuilder, styleLikes, referenceUrls, readOnlyReason }: ServicesFormProps) {
  const [rows, setRows] = useState<readonly KeyedRow[]>(() => {
    const start = services.length === 0 ? [{ id: "", name: "", summary: "", price: "" }] : services;
    return start.map((row, index) => ({ ...row, index }));
  });
  const [next, setNext] = useState(rows.length);
  const readOnly = readOnlyReason !== null;

  return (
    <ItemForm title="Services and prices" action={saveServicesItem} readOnly={readOnly} {...(readOnly ? { readOnlyReason } : {})}>
      <SectionLabel>What you offer</SectionLabel>
      {rows.map((row) => (
        <div key={row.index} className="flex flex-col gap-2 rounded-control border border-border-subtle p-3">
          <input type="hidden" name={`services.${row.index}.id`} value={row.id} />
          <FormField name={`services.${row.index}.name`} label="Service">
            <Input name={`services.${row.index}.name`} defaultValue={row.name} maxLength={80} />
          </FormField>
          <FormField name={`services.${row.index}.summary`} label="Short description (optional)">
            <Input name={`services.${row.index}.summary`} defaultValue={row.summary} maxLength={240} />
          </FormField>
          <FormField name={`services.${row.index}.price`} label="Price (optional)">
            <Input name={`services.${row.index}.price`} defaultValue={row.price} maxLength={60} placeholder="From 500" />
          </FormField>
          {readOnly || rows.length === 1 ? null : (
            <Button size="sm" variant="ghost" icon="Trash" className="self-start" onClick={() => setRows(rows.filter((candidate) => candidate.index !== row.index))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {readOnly || rows.length >= MAX_SERVICES ? null : (
        <Button
          size="sm"
          icon="Plus"
          className="self-start"
          onClick={() => {
            setRows([...rows, { id: "", name: "", summary: "", price: "", index: next }]);
            setNext(next + 1);
          }}
        >
          Add a service
        </Button>
      )}

      <SectionLabel>Anything else</SectionLabel>
      <FormField name="notesForBuilder" label="What should we know? (optional)">
        <Textarea name="notesForBuilder" defaultValue={notesForBuilder} maxLength={2000} />
      </FormField>
      <FormField name="styleLikes" label="Styles you like (optional)">
        <Textarea name="styleLikes" defaultValue={styleLikes} maxLength={600} />
      </FormField>
      {Array.from({ length: MAX_REFERENCE_URLS }, (_, index) => (
        <FormField key={index} name={`referenceUrls.${index}`} label={index === 0 ? "Websites you like (optional)" : `Website ${index + 1}`}>
          <Input name={`referenceUrls.${index}`} type="url" defaultValue={referenceUrls[index] ?? ""} placeholder="https://" />
        </FormField>
      ))}
    </ItemForm>
  );
}
