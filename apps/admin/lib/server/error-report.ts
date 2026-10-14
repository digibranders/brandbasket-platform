import "server-only";
import { createDatabaseErrorReporter, type ServerErrorContext } from "@firstfold/shared/server/error-report";
import { getStaffDb } from "./db";

const reporter = createDatabaseErrorReporter(getStaffDb);

export async function reportServerError(error: unknown, context: ServerErrorContext): Promise<string | null> {
  return reporter(error, { ...context, release: process.env.NEXT_PUBLIC_FIRSTFOLD_RELEASE });
}

