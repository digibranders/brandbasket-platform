import { parseArgs } from "node:util";
import { accounts, createDatabase, STAFF_ROLES, staffMembers, users, type StaffRole } from "@brandbasket/db";
import { loadLocalEnv, requireEnv } from "@brandbasket/db/local-env";
import { and, eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { z } from "zod";
import { createAccountWithGrant, createAuth, STAFF_SESSION_LIFETIME_SECONDS } from "../src";
import { promptHidden } from "./prompt-hidden";
import { BreachCheckUnavailableError, breachedPasswordCount } from "./breached-password";
import { PASSWORD_MIN_LENGTH, passwordPolicyProblem } from "../src/password-policy";
import { validateNewPassword } from "./password-rules";

const PASSWORD_RULE_TEXT = `at least ${PASSWORD_MIN_LENGTH} characters, with a letter, a number and a symbol`;

const USAGE = `Usage: pnpm staff:create --email <email> --name "<name>" [--role support|finance|admin]

Gives this person access to the admin console. Creates the account if the email is new; otherwise grants access to the
existing account. The role defaults to admin, which can do everything:
  support   leads, clients, support requests and the directory
  finance   support, plus pricing, invoices and their export, payments and charges
  admin     everything, including the access log
A new account's password: ${PASSWORD_RULE_TEXT}, and not in a known data breach.`;

const argsSchema = z.object({
  email: z.string("--email is required").trim().toLowerCase().pipe(z.email("--email must be a valid email address")),
  name: z
    .string("--name is required")
    .trim()
    .min(1, "--name is required")
    .max(120, "--name must be 120 characters or fewer"),
  role: z.enum(STAFF_ROLES, `--role must be one of: ${STAFF_ROLES.join(", ")}`).optional(),
});

function parseCliArgs() {
  return parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}

let parsedArgs: ReturnType<typeof parseCliArgs>;
try {
  parsedArgs = parseCliArgs();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`\n${USAGE}`);
  process.exit(1);
}

const { values } = parsedArgs;

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const parsed = argsSchema.safeParse({ email: values.email, name: values.name, role: values.role });
if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const { email, name } = parsed.data;
// Left out, a new account is an admin (what this command always made) and an existing staff member keeps their role.
const role: StaffRole = parsed.data.role ?? "admin";

loadLocalEnv();
const adminOrigin = requireEnv("ADMIN_ORIGIN");
const staffDatabase = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });

try {
  const existing = await staffDatabase.db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const existingUser = existing[0];

  let userId: string;
  if (existingUser === undefined) {
    const password = await promptHidden(`Password for ${email} (${PASSWORD_RULE_TEXT}): `);
    // Fail fast on a password that breaks the rule before bothering with a second prompt.
    const problem = passwordPolicyProblem(password);
    if (problem !== null) {
      throw new Error(problem);
    }
    const confirmation = await promptHidden("Repeat the password: ");
    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError !== null) {
      throw new Error(passwordError);
    }
    try {
      const seen = await breachedPasswordCount(password);
      if (seen > 0) {
        throw new Error(`That password appears in ${seen.toLocaleString("en-IN")} known data breaches. Choose another.`);
      }
    } catch (error) {
      // The check is not skipped when the service is down: an unchecked password is not accepted.
      if (error instanceof BreachCheckUnavailableError) throw new Error(`${error.message} No account was created.`);
      throw error;
    }

    const auth = createAuth({
      db: staffDatabase.db,
      secret: requireEnv("BETTER_AUTH_SECRET"),
      baseURL: adminOrigin,
      trustedOrigins: [adminOrigin],
      nextCookies: false,
      sessionLifetimeSeconds: STAFF_SESSION_LIFETIME_SECONDS,
    });
    // createAccountWithGrant confirms the row exists: Better Auth reports duplicates as a fake success.
    const created = await createAccountWithGrant(auth, staffDatabase.db, { email, name, password });
    userId = created.userId;
    console.log(`Created account ${email}.`);
  } else {
    userId = existingUser.id;
    console.log(`${email} already has an account (${existingUser.name}); giving it console access as ${role}.`);

    const credentialAccount = await staffDatabase.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .limit(1);
    if (credentialAccount.length === 0) {
      console.warn("Warning: this account has no password yet, so it cannot sign in until one is set.");
    }
  }

  await staffDatabase.db
    .insert(staffMembers)
    .values({ userId, role })
    .onConflictDoUpdate({
      target: staffMembers.userId,
      set: { active: true, ...(parsed.data.role === undefined ? {} : { role }) },
    });

  const [member] = await staffDatabase.db.select({ role: staffMembers.role }).from(staffMembers).where(eq(staffMembers.userId, userId));
  console.log(`${email} is now ${member?.role ?? role} staff. Sign in at ${adminOrigin}/login`);
} catch (error) {
  if (error instanceof DrizzleQueryError) {
    // error.message on a DrizzleQueryError embeds the SQL params, which can include a password hash.
    // Only the cause (the underlying driver error) is safe to print.
    const causeMessage = error.cause instanceof Error ? error.cause.message : "unknown database error";
    console.error(`Database error: ${causeMessage}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  await staffDatabase.close();
}
