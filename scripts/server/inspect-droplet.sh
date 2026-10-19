#!/usr/bin/env bash
# What this does: prints a read-only picture of a server, so you can see what is already there BEFORE anything is installed:
# operating system, memory/swap/disk, which ports are taken (and by what), nginx and which names it serves, PostgreSQL and its
# databases and roles, Node/pnpm, systemd services that look like an existing API, firewall, TLS certificates, cron, users, and
# whether the Brandbasket ports (3201, 3203) and directory (/srv/brandbasket) are free. It changes NOTHING: no installs, no writes, no restarts.
# Assumes: bash on the server (Ubuntu/Debian expected, anything Linux works); run as root for the full picture (sudo bash ...),
# as a normal user for a partial one. Every section says so when a tool is missing instead of failing. Safe to re-run any time.
# Run it on the droplet from here without copying anything:   ssh root@<droplet address> 'bash -s' < scripts/server/inspect-droplet.sh
# (this script never connects anywhere itself; the address is only in the ssh command you type.) Save the output and read section 14.
set -u

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n== %s\n' "$*"; }
try() { "$@" 2>&1 || true; }
AS_ROOT=0; [[ "$(id -u)" -eq 0 ]] && AS_ROOT=1

section "1. System"
if [[ -r /etc/os-release ]]; then grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release; else uname -a; fi
echo "kernel: $(uname -r)  arch: $(uname -m)  uptime: $(uptime 2>/dev/null | sed 's/^ *//')"
echo "running as: $(id -un) (root: $([[ $AS_ROOT -eq 1 ]] && echo yes || echo no, some sections are partial))"
have nproc && echo "cpus: $(nproc)"
have timedatectl && try timedatectl | grep -E 'Time zone|synchronized|NTP' || true

section "2. Memory, swap, disk"
have free && try free -h || { try vm_stat | head -3; }
if [[ -r /proc/swaps ]]; then cat /proc/swaps; fi
try df -h / /srv /var 2>/dev/null | sort -u
if [[ -d /srv ]]; then echo "/srv:"; try ls -la /srv; fi
if [[ -d /srv/brandbasket ]]; then echo "/srv/brandbasket ALREADY EXISTS:"; try ls -la /srv/brandbasket; fi

section "3. Listening ports (what is already taken)"
if have ss; then
  if [[ $AS_ROOT -eq 1 ]]; then try ss -ltnp; else try ss -ltn; fi
elif have lsof; then try lsof -nP -iTCP -sTCP:LISTEN
else echo "(neither ss nor lsof found)"; fi
for port in 80 443 3201 3203 5432; do
  if have ss && ss -ltn 2>/dev/null | grep -qE "[:.]$port[[:space:]]"; then echo "port $port: IN USE"; else echo "port $port: free (or not visible)"; fi
done

section "4. nginx"
if have nginx; then
  nginx -v 2>&1
  if [[ $AS_ROOT -eq 1 ]]; then
    echo "config test:"; nginx -t 2>&1 | sed 's/^/  /'
    echo "server blocks (name / listen / proxy target):"
    nginx -T 2>/dev/null | grep -E '^\s*(server_name|listen|proxy_pass|include /etc/nginx/(sites-enabled|conf\.d))' | sed 's/^\s*/  /' | head -80
  else echo "  (run as root to see the configuration)"; fi
  echo "sites-enabled:"; try ls -la /etc/nginx/sites-enabled
  echo "conf.d:"; try ls -la /etc/nginx/conf.d
  echo "conf.d is included by nginx.conf: $(grep -c 'conf.d' /etc/nginx/nginx.conf 2>/dev/null || echo unknown) mention(s)"
  have systemctl && echo "nginx service: $(systemctl is-active nginx 2>&1) / $(systemctl is-enabled nginx 2>&1)"
else echo "nginx: NOT INSTALLED"; fi

section "5. PostgreSQL"
if have psql || have pg_lsclusters || [[ -d /etc/postgresql ]]; then
  have psql && psql --version
  have pg_lsclusters && try pg_lsclusters
  if [[ $AS_ROOT -eq 1 ]] && id postgres >/dev/null 2>&1; then
    echo "databases:"; (cd / && try runuser -u postgres -- psql -X -At -c "select datname || '  owner=' || pg_catalog.pg_get_userbyid(datdba) from pg_database where not datistemplate order by 1") | sed 's/^/  /'
    echo "roles (name, can login, superuser):"; (cd / && try runuser -u postgres -- psql -X -At -c "select rolname || '  login=' || rolcanlogin || '  super=' || rolsuper from pg_roles where rolname !~ '^pg_' order by 1") | sed 's/^/  /'
    echo "Brandbasket names already present: $(cd / && runuser -u postgres -- psql -X -At -c "select string_agg(name, ', ') from (select datname as name from pg_database where datname like 'brandbasket%' union all select rolname from pg_roles where rolname like 'brandbasket%' or rolname like 'brandbasket%' or rolname like 'brandbasket_platform%') s" 2>/dev/null || echo unknown)"
  else echo "  (run as root to list databases and roles)"; fi
else echo "PostgreSQL: NOT INSTALLED"; fi

section "6. Node, pnpm and build tools"
have node && echo "node $(node -v)" || echo "node: NOT INSTALLED (Brandbasket needs 24 or newer)"
have pnpm && echo "pnpm $(pnpm -v 2>/dev/null)" || echo "pnpm: not on PATH"
have corepack && echo "corepack: present" || echo "corepack: absent"
for tool in rsync curl openssl certbot git; do have "$tool" && echo "$tool: yes" || echo "$tool: no"; done

section "7. Services that look like an existing API or app"
if have systemctl; then
  try systemctl list-units --type=service --state=running --no-pager --no-legend | grep -viE 'systemd|dbus|ssh|cron|getty|network|resolved|polkit|rsyslog|snapd|multipathd|unattended|udisks|irqbalance|chrony|ntp|qemu|packagekit|ModemManager|do-agent|droplet-agent' | sed 's/^/  /'
  echo "Brandbasket units already installed:"; try systemctl list-unit-files 'brandbasket*' --no-pager --no-legend | sed 's/^/  /'
fi
have pm2 && { echo "pm2 processes:"; try pm2 list; }
have docker && { echo "docker containers:"; try docker ps --format '  {{.Names}}  {{.Image}}  {{.Ports}}'; }

section "8. Firewall"
if have ufw; then try ufw status verbose; else echo "ufw: not installed"; fi
have iptables && [[ $AS_ROOT -eq 1 ]] && { echo "iptables INPUT policy:"; try iptables -S INPUT | head -5; }
echo "(a DigitalOcean cloud firewall, if any, is configured in the DigitalOcean panel and is not visible from here.)"

section "9. TLS certificates and DNS as this machine sees them"
if have certbot && [[ $AS_ROOT -eq 1 ]]; then try certbot certificates; else echo "certbot: not installed or not root"; fi
for host in app.brandbasket.in console.brandbasket.in; do
  if have getent; then echo "$host -> $(getent hosts "$host" 2>/dev/null | awk '{print $1}' | tr '\n' ' ')"; elif have dig; then echo "$host -> $(dig +short "$host" | tr '\n' ' ')"; fi
done

section "10. Scheduled jobs"
have crontab && { echo "root crontab:"; try crontab -l; }
have systemctl && try systemctl list-timers --no-pager | head -15

section "11. Users and ssh"
awk -F: '$7 !~ /(nologin|false)$/ { print "  " $1 " (" $6 ")" }' /etc/passwd 2>/dev/null
id deploy >/dev/null 2>&1 && echo "user 'deploy': exists" || echo "user 'deploy': does not exist"
[[ -r /etc/ssh/sshd_config ]] && grep -E '^\s*(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | sed 's/^/  /'

section "12. Updates and logs"
have unattended-upgrade && echo "unattended-upgrades: installed" || echo "unattended-upgrades: not installed"
[[ -f /var/run/reboot-required ]] && echo "REBOOT REQUIRED" || echo "no reboot pending"
have journalctl && try journalctl --disk-usage

section "13. Brandbasket readiness (what to look for in the output above)"
echo "  - 80/443 taken by nginx: expected; Brandbasket adds two server names beside what is there."
echo "  - 3201 or 3203 IN USE by something else: change the ports in the units and nginx files before going on."
echo "  - nginx -t not passing, or conf.d not included: fix before bootstrap, it will refuse to reload a broken nginx."
echo "  - Postgres on 5432 present: setup-database.sh adds brandbasket_* databases and roles beside it; it drops nothing."
echo "  - Under 2 GB of memory and no swap: add swap before running the apps; never build on this machine."

section "14. Done. Nothing was changed."
