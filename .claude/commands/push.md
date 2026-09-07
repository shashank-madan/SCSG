---
description: Push the current branch to origin (creating it if needed) and open a PR describing the work
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git log:*), Bash(git diff:*), Bash(git remote:*), Bash(git push:*), Bash(git fetch:*), Bash(gh:*)
---

# /push

Push the current branch to the `origin` remote and open a pull request that
describes what was done and how it was done.

## Instructions

1. **Assess the branch and remote.** Run in parallel:
   - `git rev-parse --abbrev-ref HEAD` — current branch name
   - `git status --short` — confirm the working tree is clean (all intended work committed)
   - `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null` — does an upstream exist?
   - `git remote get-url origin` — confirm a remote exists
   - `git log --oneline origin/HEAD..HEAD 2>/dev/null` or `git log --oneline -20` — the commits that will be pushed

2. **Guard rails — stop and ask if any of these:**
   - Working tree has **uncommitted changes**: warn the user and ask whether to commit first (suggest `/commit`) or push anyway. Do not silently push a dirty tree.
   - Current branch is **`main`** (or the repo's default branch): pushing a PR from the default branch onto itself is almost never intended. Ask whether to create a feature branch first, and if so, suggest a name derived from the recent commits (e.g. `feat/<topic>`), create it with `git switch -c <name>`, and continue.
   - **No commits to push** (branch is level with its upstream): say so and stop.

3. **Push, creating the remote branch if needed.**
   - If no upstream is set: `git push -u origin HEAD` — this creates the remote branch and sets tracking.
   - If an upstream exists: `git push`.
   - If the push is rejected (remote has commits you lack), STOP and report; do not force-push unless the user explicitly asks.

4. **Open a pull request with `gh`.**
   - First check `gh` is available and authenticated (`gh auth status`). If `gh` is **not installed or not authenticated**, STOP after the push, print the branch's compare URL
     (`https://github.com/<owner>/<repo>/compare/<branch>?expand=1`), and tell the user to open the PR manually or install/auth `gh`. Do not fail silently.
   - If a PR for this branch already exists, report its URL instead of creating a duplicate (`gh pr view --json url,state`).
   - Otherwise create it:
     ```
     gh pr create --base <default-branch> --head <branch> --title "<title>" --body "$(cat <<'EOF'
     <body>
     EOF
     )"
     ```
   - Base branch: the repo default (usually `main`). Head: the current branch.

5. **Write the PR title and body.**
   - **Title:** a concise summary of the change set, imperative mood, no trailing period. Derive it from the commits; if there is one commit, its subject is a good title.
   - **Body:** structured markdown describing the work. Include:
     - **## What** — what changed, in plain terms (the user-facing / behavioral summary).
     - **## How** — how it was implemented: key files, approach, notable decisions or trade-offs. Reference the relevant PRD module or build-order step when it adds context.
     - **## Commits** — a bulleted list of the commit subjects being merged (optional if there is only one).
   - **Do NOT include a testing/verification section** — the user does not want test steps in the PR body.
   - Base the description on the actual commit messages and diffs, not guesses. Read `git log` and `git diff <base>...HEAD` to write it accurately.

6. **Report.** Print the PR URL (and the branch it was pushed to) so the user can click through.

## Hard rules

- **Never** add a `Co-Authored-By` trailer, a "Generated with Claude Code" line, a `Claude-Session` line, or any attribution to Claude / an AI assistant — not in commits and not in the PR title or body. The PR body must contain no such lines whatsoever.
- **Never** force-push (`--force` / `--force-with-lease`) unless the user explicitly asks.
- **Never** use `--no-verify` or skip hooks.
- **Never** merge the PR — creation only. The user merges when they choose.
- Do not create commits here; this command only pushes already-committed work. If there is nothing committed to push, stop and say so.

$ARGUMENTS
