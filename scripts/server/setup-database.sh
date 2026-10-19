#!/usr/bin/env bash
# What this does: creates Brandbasket's database roles and its two databases on the droplet's Postgres, and the passwords for
# the roles. Safe to run again: it only creates what is missing, and re-sets each role's password to the one in the
# secrets file (the file is the source of truth).
#
# What it assumes: it runs as root on the droplet, Postgres is installed and running, and `sudo -u postgres psql` works. It
# never drops or alters anything it did not create (existing databases and roles from other software, such as the API that
# shares this box, are left alone). Dry-run by default: it prints what it would do. Pass --apply to do it.
#
# Roles (names fixed by the code: migrations and packages/db/src/roles.ts grant to them; passwords are Brandbasket's own, new):
#   bb_owner       owns brandbasket_platform; used ONLY to run migrations, through /usr/local/sbin/brandbasket-migrate; never in an env file.
#                     Has CREATEROLE + ADMIN OPTION on the three application roles below, because migrations alter and grant them.
#   bb_app     the dashboard's connection: row-level security applies           -> DATABASE_URL
#   bb_staff   staff and background work                                       -> DATABASE_URL_STAFF (both apps)
#   bb_public  insert-only: sign-up codes and account email outbox writes       -> DATABASE_URL_PUBLIC
#   bb_cms     owns brandbasket_platform_payload (blog and content); runs its migrations -> DATABASE_URL_PAYLOAD (both apps)
#
# Secrets: /root/brandbasket-secrets.env (mode 600): OWNER_PW, APP_PW, STAFF_PW, PUBLIC_PW, CMS_PW. Missing ones are generated.
#
# Test hooks (never needed on the droplet): BRANDBASKET_PSQL (the psql command line), BRANDBASKET_SECRETS_FILE, BRANDBASKET_DB, BRANDBASKET_PAYLOAD_DB.
set -euo pipefail

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h | --help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 64 ;;
  esac
done

SECRETS_FILE="${BRANDBASKET_SECRETS_FILE:-/root/brandbasket-secrets.env}"
DB="${BRANDBASKET_DB:-brandbasket_platform}"
PAYLOAD_DB="${BRANDBASKET_PAYLOAD_DB:-brandbasket_platform_payload}"
read -r -a PSQL <<<"${BRANDBASKET_PSQL:-sudo -u postgres psql}"
readonly SECRETS_FILE DB PAYLOAD_DB

say() { printf '%s\n' "$*"; }
psql_q() { "${PSQL[@]}" -X -v ON_ERROR_STOP=1 -Atq "$@"; }

say "== Inspecting (read-only)"
psql_q -c "select 'postgres ' || current_setting('server_version')" || { say "Cannot reach Postgres with: ${PSQL[*]}" >&2; exit 1; }
say "existing roles named brandbasket_:"
psql_q -c "select '  ' || rolname || case when rolcanlogin then ' (login)' else ' (nologin)' end from pg_roles where rolname ~ '^brandbasket_' order by 1" || true
say "existing databases named brandbasket_:"
psql_q -c "select '  ' || datname from pg_database where datname ~ '^brandbasket_' order by 1" || true

# --- secrets --------------------------------------------------------------------------------------------------------
get_secret() { [[ -f "$SECRETS_FILE" ]] && grep -E "^$1=" "$SECRETS_FILE" | head -n 1 | cut -d= -f2- || true; }
# One shell variable per secret (bash 3.2, which a Mac still has, has no associative arrays).
for name in OWNER_PW APP_PW STAFF_PW PUBLIC_PW CMS_PW; do
  value="$(get_secret "$name")"
  if [[ -z "$value" ]]; then
    if [[ $APPLY -eq 1 ]]; then
      value="$(openssl rand -hex 24)"
      # umask first so the file is never readable by anyone else, even for an instant.
      ( umask 077; touch "$SECRETS_FILE" ); chmod 600 "$SECRETS_FILE"
      printf '%s=%s\n' "$name" "$value" >>"$SECRETS_FILE"
      say "generated $name in $SECRETS_FILE"
    else
      say "[dry-run] would generate $name in $SECRETS_FILE"
      value="dry-run-placeholder"
    fi
  fi
  printf -v "PW_$name" '%s' "$value"
done

# --- the SQL ----------------------------------------------------------------------------------------------------------
# \gexec runs each generated statement, so CREATE DATABASE (which cannot run inside a function) works too, and a second run
# finds everything there. Passwords reach psql on its standard input only, never on a command line.
sql() {
  cat <<SQL
\\set ON_ERROR_STOP on
\\set owner_pw '${PW_OWNER_PW}'
\\set app_pw '${PW_APP_PW}'
\\set staff_pw '${PW_STAFF_PW}'
\\set public_pw '${PW_PUBLIC_PW}'
\\set cms_pw '${PW_CMS_PW}'
\\set db '${DB}'
\\set pdb '${PAYLOAD_DB}'

CREATE TEMP TABLE wanted_roles (name text, pw text);
INSERT INTO wanted_roles VALUES
  ('bb_owner', :'owner_pw'), ('bb_app', :'app_pw'), ('bb_staff', :'staff_pw'),
  ('bb_public', :'public_pw'), ('bb_cms', :'cms_pw');

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', name, pw)
FROM wanted_roles WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = name) \\gexec
SELECT format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', name, pw)
FROM wanted_roles WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = name) \\gexec

SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8''', db, owner)
FROM (VALUES (:'db', 'bb_owner'), (:'pdb', 'bb_cms')) AS wanted(db, owner)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = db) \\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', db, owner)
FROM (VALUES (:'db', 'bb_owner'), (:'pdb', 'bb_cms')) AS wanted(db, owner) \\gexec

-- Migrations alter and grant the application roles (0018, 0132: NOINHERIT, GRANT role TO role), which a plain database owner
-- may not do. bb_owner therefore holds CREATEROLE and ADMIN OPTION on exactly those roles; it still cannot create
-- databases, bypass row-level security or read anything outside brandbasket_platform, and its password is on the server only.
ALTER ROLE bb_owner CREATEROLE;
SELECT format('GRANT %I TO bb_owner WITH ADMIN OPTION', name)
FROM (VALUES ('bb_app'), ('bb_staff'), ('bb_public')) AS r(name) \\gexec

-- Only the roles that need a database may connect to it.
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', db) FROM (VALUES (:'db'), (:'pdb')) AS d(db) \\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', role)
FROM (VALUES ('bb_owner'), ('bb_app'), ('bb_staff'), ('bb_public')) AS r(role) \\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO bb_cms', :'pdb') \\gexec
SQL
}

say "== Plan"
say "  roles: bb_owner bb_app bb_staff bb_public bb_cms (all login, none superuser)"
say "  databases: ${DB} (owner bb_owner), ${PAYLOAD_DB} (owner bb_cms)"
if [[ $APPLY -eq 0 ]]; then
  say "[dry-run] nothing changed. Run again with --apply."
  exit 0
fi

sql | "${PSQL[@]}" -X -q >/dev/null
say "== Done. Roles and databases now:"
psql_q -c "select '  ' || rolname || case when rolcanlogin then ' (login)' else ' (nologin)' end from pg_roles where rolname ~ '^brandbasket_' order by 1"
psql_q -c "select '  ' || d.datname || ' owned by ' || r.rolname from pg_database d join pg_roles r on r.oid = d.datdba where d.datname ~ '^brandbasket_' order by 1"
say "Next: make the env files (scripts/server/make-env-files.sh), then the first release (docs/deployment/brandbasket-droplet.md)."
