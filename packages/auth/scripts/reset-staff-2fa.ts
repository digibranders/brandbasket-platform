import { parseArgs } from "node:util";
import { createDatabase } from "@brandbasket/db";
import { loadLocalEnv, requireEnv } from "@brandbasket/db/local-env";
import { StaffRecoveryError, resetStaffSignIn } from "../src/staff-recovery";

const USAGE = `Usage: pnpm staff:reset-2fa --email <email> [--new-email <email>]

For a staff member locked out of the console. Ends their sessions, removes their unused sign-in codes and lifts the
sign-in code limits for their account. With --new-email it also moves the account to that address, for a mailbox that
is lost, so the next code is emailed there. The password is not changed. Run it on the server with the production
environment loaded.`;

let values: ReturnType<typeof parseArgs>["values"];
try {
  ({ values } = parseArgs({ options: { email: { type: "string" }, "new-email": { type: "string" }, help: { type: "boolean", short: "h" } } }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`\n${USAGE}`);
  process.exit(1);
}

if (values.help === true) {
  console.log(USAGE);
  process.exit(0);
}
const email = values.email;
const newEmail = values["new-email"];
if (typeof email !== "string" || (newEmail !== undefined && typeof newEmail !== "string")) {
  console.error(`--email is required.\n\n${USAGE}`);
  process.exit(1);
}

loadLocalEnv();
const staffDatabase = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
try {
  const result = await resetStaffSignIn(staffDatabase.db, { email, ...(newEmail === undefined ? {} : { newEmail }) });
  console.log(`Reset sign-in for ${result.email}: ${result.sessionsEnded} session(s) ended, ${result.codesRemoved} unused code(s) removed.`);
  console.log("They can sign in now; the code is emailed to that address.");
} catch (error) {
  console.error(error instanceof StaffRecoveryError ? error.message : error);
  process.exitCode = 1;
} finally {
  await staffDatabase.close();
}
