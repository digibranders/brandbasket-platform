"use client";

import { useCallback, useEffect, useState, useTransition, type FormEvent } from "react";
import { actionFail, type ActionFailure, type ActionResult } from "@/lib/action-result";
import { useToast } from "@/ui";
import { formSnapshot, toFormData } from "../rules";
import { useSaveBarHost } from "./save-bar-host";

const SAVE_FAILED = "We could not save that. Try again.";

export interface SectionForm {
  readonly values: Readonly<Record<string, string>>;
  readonly set: (name: string, next: string) => void;
  readonly pending: boolean;
  /** The banner message above the form when a save was refused. */
  readonly message: string | undefined;
  /** The message for one field, shown under it. */
  readonly errorOf: (name: string) => string | undefined;
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
}

interface Options {
  /** The DOM id of the form; the SaveBar's Save button submits the form with this id. */
  readonly id: string;
  /** The saved values, by field name. The section remounts (a new React key) when they change, so state starts from them again. */
  readonly initial: Readonly<Record<string, string>>;
  readonly action: (formData: FormData) => Promise<ActionResult>;
  /** The toast after a save went through. */
  readonly saved: string;
}

/**
 * The state of one section form: its values, whether they differ from what is saved, and the save. The values live in state
 * and are sent as FormData built from it, so a refused save keeps everything typed. The SaveBar host is told about the
 * changes. A save that goes through revalidates the page, the saved values change, and the section remounts clean.
 */
export function useSectionForm({ id, initial, action, saved }: Options): SectionForm {
  const host = useSaveBarHost();
  const toast = useToast();
  const [values, setValues] = useState<Readonly<Record<string, string>>>(initial);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = formSnapshot(Object.entries(values)) !== formSnapshot(Object.entries(initial));

  const discard = useCallback(() => {
    setValues(initial);
    setFailure(null);
  }, [initial]);

  useEffect(() => {
    host.report(id, { dirty, pending, discard });
  }, [host, id, dirty, pending, discard]);
  useEffect(() => () => host.forget(id), [host, id]);

  const set = useCallback((name: string, next: string) => {
    setValues((previous) => ({ ...previous, [name]: next }));
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await action(toFormData(values));
      } catch {
        // The request never got an answer (offline, a dropped connection). Keep the form and what was typed on screen
        // instead of handing the whole page to the route's error screen. These actions never redirect, so nothing of
        // Next's own is caught here.
        result = actionFail(SAVE_FAILED);
      }
      if (result.ok) {
        setFailure(null);
        toast(saved);
      } else {
        setFailure(result);
      }
    });
  };

  return { values, set, pending, message: failure?.message, errorOf: (name) => failure?.fieldErrors?.[name], submit };
}
