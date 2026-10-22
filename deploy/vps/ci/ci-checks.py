#!/usr/bin/env python3
"""Shows one CI run on GitHub as one check run per step ("CI: install", "CI: lint", ...), the way separate Actions jobs
appear in a pull request's Checks tab. Installed as /usr/local/lib/brandbasket/ci-checks.py; called by brandbasket-ci. A copy of Firstfold's
ci-checks.py (which already takes the repository as an argument) with one change: the journal unit named in the footer.

    ci-checks.py <state file> <log file> <owner/repo> <sha> <branch> <progress|final> <exit status> <step>...

The GitHub App installation token comes in the GH_TOKEN environment variable, never on the command line.

The log has one "<unix time> <text>" line per output line, and the checks print "== step: <name>" as each step
starts (ci-steps.sh). On the first call every expected step is created as queued; each later call moves steps along:
a step whose successor has started passed, the newest one is running (progress) or passed/failed (final), and on a
failure the steps after it are skipped. The state file keeps the check run ids so finished steps are not sent again.
Each step's own lines, with secrets masked, become its log on GitHub.

Best effort: a GitHub error is printed to stderr and the script still exits 0, so CI reporting never breaks anything.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
SECRETS = [
    (re.compile(r"(postgres(?:ql)?://[^:/@\s]*:)[^@\s]*@"), r"\1***@"),
    (re.compile(r"(?i)\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|_PW|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)\S+"), r"\1***"),
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"), r"\1***"),
    (re.compile(r"\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]+"), "***"),
]
LOG_BUDGET = 60000


def api(method, path, body):
    request = urllib.request.Request(
        "https://api.github.com" + path,
        data=json.dumps(body).encode(),
        method=method,
        headers={
            "Authorization": "Bearer " + os.environ.get("GH_TOKEN", ""),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        print(f"ci checks: {method} {path} failed: {error}", file=sys.stderr)
        return None


def duration(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds // 60} min {seconds % 60} s" if seconds >= 60 else f"{seconds} s"


def iso(seconds):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(seconds))


def clean(text):
    text = ANSI.sub("", text)
    for pattern, replacement in SECRETS:
        text = pattern.sub(replacement, text)
    return text


def read_log(path, fallback_time):
    """[(name, start, [lines])] in order; lines before the first step belong to the first step."""
    steps, preamble = [], []
    try:
        with open(path, encoding="utf-8", errors="replace") as log:
            for raw in log:
                stamp, _, text = raw.rstrip("\n").partition(" ")
                when = int(stamp) if stamp.isdigit() else fallback_time
                text = clean(text)
                marker = re.match(r"^== step: (.+)$", text)
                if marker:
                    steps.append([marker.group(1).strip(), when, preamble + [text]])
                    preamble = []
                elif steps:
                    steps[-1][2].append(text)
                else:
                    preamble.append(text)
    except FileNotFoundError:
        pass
    return steps, preamble


def log_text(lines):
    kept, budget = [], LOG_BUDGET
    for line in reversed(lines):
        budget -= len(line) + 1
        if budget < 0:
            kept.append("... (earlier lines are in the journal on the VPS)")
            break
        kept.append(line)
    return "```text\n" + "\n".join(reversed(kept)).replace("```", "'''") + "\n```"


def main():
    state_file, log_file, repo, sha, branch, mode, status = sys.argv[1:8]
    expected = sys.argv[8:]
    status = int(status)
    now = int(time.time())
    footer = f"Commit `{sha[:7]}` on `{branch}`. Full log on the VPS: `journalctl -u brandbasket-ci`."

    try:
        with open(state_file) as f:
            state = json.load(f)
    except (FileNotFoundError, ValueError):
        state = {}

    for name in expected:
        if name not in state:
            run = api("POST", f"/repos/{repo}/check-runs", {
                "name": f"CI: {name}", "head_sha": sha, "status": "queued",
                "output": {"title": "Waiting", "summary": f"Waiting for the steps before it. {footer}"},
            })
            state[name] = {"id": run.get("id") if run else None, "done": False}

    steps, preamble = read_log(log_file, now)
    seen = {name: i for i, (name, _, _) in enumerate(steps)}
    failed = None
    if mode == "final" and status != 0:
        failed = steps[-1][0] if steps else (expected[0] if expected else None)

    updates, started = {}, {}
    for i, (name, start, lines) in enumerate(steps):
        is_last = i + 1 == len(steps)
        end = steps[i + 1][1] if not is_last else now
        took = duration(end - start)
        started[name] = start
        if not is_last or (mode == "final" and status == 0):
            updates[name] = ("completed", "success", f"Passed in {took}", f"Passed in {took}. {footer}", lines, end)
        elif mode == "final":
            updates[name] = ("completed", "failure", f"Failed after {took}",
                             f"**{name} failed** after {took}; the steps after it were skipped. {footer}", lines, end)
        else:
            updates[name] = ("in_progress", None, f"Running ({took} so far)", f"Running. {footer}", lines, None)

    if mode == "final":
        for name in expected:
            if name in seen:
                continue
            if failed is not None and not steps and name == failed:
                updates[name] = ("completed", "failure", "Failed before it started",
                                 f"The checks could not start. {footer}", preamble, now)
            else:
                reason = f"{failed} failed" if failed else "the run ended early"
                updates[name] = ("completed", "skipped", f"Skipped: {reason}", f"Not run because {reason}. {footer}", [], now)

    for name, (run_status, conclusion, title, summary, lines, finished) in updates.items():
        entry = state.get(name)
        if not entry or entry.get("done") or not entry.get("id"):
            continue
        body = {"status": run_status, "output": {"title": title, "summary": summary}}
        if name in started:
            body["started_at"] = iso(started[name])  # GitHub times each check from its own step, not from queueing
        if lines:
            body["output"]["text"] = log_text(lines)
        if run_status == "completed":
            body["conclusion"] = conclusion
            body["completed_at"] = iso(finished)
        if api("PATCH", f"/repos/{repo}/check-runs/{entry['id']}", body) is not None and run_status == "completed":
            entry["done"] = True

    with open(state_file, "w") as f:
        json.dump(state, f)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # reporting must never fail the caller
        print(f"ci checks: {error}", file=sys.stderr)
    sys.exit(0)
