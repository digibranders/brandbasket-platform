/** One message per field, keyed by the form field's name. The Field primitive shows it under the hint. */
export type FieldErrors = Readonly<Record<string, string>>;

export interface ActionSuccess<T> {
  readonly ok: true;
  readonly data?: T;
}

export interface ActionFailure {
  readonly ok: false;
  /** What went wrong and how to fix it, in plain words. Shown in a Banner above the form. */
  readonly message: string;
  readonly fieldErrors?: FieldErrors;
}

/** What every server action returns (BUILD-RULES rule 5). */
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

export function actionOk(): ActionSuccess<never>;
export function actionOk<T>(data: T): ActionSuccess<T>;
export function actionOk<T>(...args: [] | [T]): ActionSuccess<T> {
  return args.length === 0 ? { ok: true } : { ok: true, data: args[0] };
}

export function actionFail(message: string, fieldErrors?: FieldErrors): ActionFailure {
  return fieldErrors === undefined ? { ok: false, message } : { ok: false, message, fieldErrors };
}
