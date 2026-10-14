import { Client } from "pg";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { APPLICATION_ROLES } from "../src/roles";

/** Least privilege: login only. Row-level security applies because these roles never own tables or bypass RLS. */
const ROLE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS";

loadLocalEnv();

// Read every password first, so a missing variable can't leave the roles half set up.
const roles = APPLICATION_ROLES.map((role) => ({ name: role.name, password: requireEnv(role.passwordEnv) }));

const client = new Client({ connectionString: requireEnv("DATABASE_URL_OWNER") });
await client.connect();

try {
  for (const role of roles) {
    const identifier = client.escapeIdentifier(role.name);
    const password = client.escapeLiteral(role.password);
    const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role.name]);

    if (existing.rowCount === 0) {
      await client.query(`CREATE ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Created role ${role.name}`);
    } else {
      // Roles are cluster-wide: this resets the password for every local checkout that uses this Postgres server.
      await client.query(`ALTER ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Updated role ${role.name}; its password now matches this checkout's .env.local`);
    }
  }
} finally {
  await client.end();
}
