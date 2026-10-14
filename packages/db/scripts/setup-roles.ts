import { Client } from "pg";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { APPLICATION_ROLES, CMS_DATABASE, CMS_ROLE } from "../src/roles";

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

  // The CMS's database belongs to the CMS role alone: nothing the application runs as can open it.
  const database = client.escapeIdentifier(CMS_DATABASE);
  const owner = client.escapeIdentifier(CMS_ROLE);
  const existingDatabase = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [CMS_DATABASE]);
  if (existingDatabase.rowCount === 0) {
    await client.query(`CREATE DATABASE ${database} OWNER ${owner}`);
    console.log(`Created database ${CMS_DATABASE}, owned by ${CMS_ROLE}`);
  } else {
    await client.query(`ALTER DATABASE ${database} OWNER TO ${owner}`);
    console.log(`Database ${CMS_DATABASE} is owned by ${CMS_ROLE}`);
  }
} finally {
  await client.end();
}
