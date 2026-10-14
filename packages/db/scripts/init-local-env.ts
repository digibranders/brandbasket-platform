import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { buildAdminEnvFile, buildLocalEnvFile } from "../src/local-env-template";
import { ADMIN_ENV_RELATIVE_PATH, findWorkspaceRoot, LOCAL_ENV_RELATIVE_PATH } from "../src/local-env";

/** Narrows an unknown catch value to a Node system error carrying a `code`. */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

const root = findWorkspaceRoot();

const secrets = {
  osUser: userInfo().username,
  appPassword: randomBytes(24).toString("hex"),
  staffPassword: randomBytes(24).toString("hex"),
  publicPassword: randomBytes(24).toString("hex"),
  cmsPassword: randomBytes(24).toString("hex"),
  authSecret: randomBytes(32).toString("base64"),
  leadsApiToken: randomBytes(32).toString("hex"),
  payloadSecret: randomBytes(32).toString("base64"),
};

/**
 * Both apps in one run, because they share secrets: the same BETTER_AUTH_SECRET, the same staff password, the
 * same Payload database. Generating them separately would produce two environments that cannot verify each
 * other's sessions.
 */
const files = [
  { path: join(root, LOCAL_ENV_RELATIVE_PATH), contents: buildLocalEnvFile(secrets) },
  { path: join(root, ADMIN_ENV_RELATIVE_PATH), contents: buildAdminEnvFile(secrets) },
];

const existing = files.filter((file) => existsSync(file.path));
if (existing.length > 0) {
  console.error(
    `${existing.map((file) => file.path).join(" and ")} already exists, so nothing was changed.\n` +
      "Remove the file(s) first if you want new secrets — and remove both together, since they share secrets.",
  );
  process.exit(1);
}

const written: string[] = [];
try {
  for (const file of files) {
    // "wx" fails atomically if the file already exists, avoiding a check-then-act race with the existsSync
    // above, and `mode` is only honored when the file is newly created. These files hold database passwords
    // and signing secrets, so they are readable by their owner only.
    writeFileSync(file.path, file.contents, { mode: 0o600, flag: "wx" });
    written.push(file.path);
  }
} catch (error) {
  // Never leave half an environment behind: one file without the other is a setup that silently fails to sign in.
  for (const path of written) unlinkSync(path);
  if (isErrnoException(error) && error.code === "EEXIST") {
    console.error(`${error.path ?? "A file"} already exists, so nothing was changed.`);
    process.exit(1);
  }
  throw error;
}

for (const path of written) console.log(`Wrote ${path}`);
console.log("Copy the platform's LEADS_API_TOKEN into the website repository's .env.local so the Get started form can send enquiries.");
