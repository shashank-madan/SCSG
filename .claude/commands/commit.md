---
description: Analyze changes, propose a minimal commit split, and commit with descriptive messages
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git restore:*), Bash(git reset:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git check-ignore:*)
---

# /commit

Analyze the working tree and create one or more well-formed commits.

## Instructions

1. **Survey the changes.** Run these in parallel to understand the full picture:
   - `git status --short` — staged, unstaged, and untracked files
   - `git diff` — unstaged changes
   - `git diff --cached` — already-staged changes
   - `git log --oneline -10` — recent history, to match the repo's existing commit style
   - If `$ARGUMENTS` is non-empty, treat it as scope/intent guidance from the user (e.g. a specific area to commit, or a message hint) and honor it.

2. **Safety first — never commit secrets or noise.**
   - Confirm no `.env*` (except `.env.example`), credential, key, or token file is staged. Use `git check-ignore` if unsure. If one is not ignored, STOP and warn the user instead of committing it.
   - Never stage `node_modules`, build output (`.output`, `dist`, `.tanstack`, `.wrangler`), or editor caches.
   - Never use `git add -A` blindly. Add files explicitly by path so the split stays intentional.

3. **Propose a commit split.**
   - Group changes into the **smallest number of commits** that are still logically coherent. Prefer fewer commits; only split when changes serve genuinely distinct purposes (e.g. a feature vs. an unrelated bug fix vs. a config change).
   - Use **whole-file granularity** whenever possible — assign each changed file to exactly one commit. Only fall back to staging hunks (`git add -p` style) when a single file genuinely contains two unrelated changes that must be separated.
   - A file that is generated (lockfiles, `routeTree.gen.ts`, etc.) belongs in the same commit as the change that regenerated it.

4. **Show the plan and get confirmation.**
   - Present the proposed split as a numbered list: for each commit, the file list and the one-line subject you intend to use.
   - Ask the user to confirm or adjust before committing. If the user already gave explicit intent in `$ARGUMENTS`, you may proceed without a second confirmation for a single obvious commit.

5. **Write descriptive messages.**
   - **Subject line:** imperative mood, concise (aim ≤ 72 chars), no trailing period. Match the tense/style of recent commits in `git log`.
   - **Body (when the change warrants it):** a blank line after the subject, then *why* the change was made and any non-obvious *what*. Wrap at ~72 chars. Use bullet points for multiple distinct points. Skip the body for trivial, self-evident changes.
   - Reference the relevant PRD module or build-order step when it adds context.

6. **Commit.**
   - Stage each commit's files explicitly, then commit with a heredoc for multi-line messages:
     ```
     git commit -m "$(cat <<'EOF'
     subject line

     body line one
     body line two
     EOF
     )"
     ```
   - Do this once per planned commit, in a sensible order (dependencies/config before the code that uses them when it matters).

7. **Report.** After committing, run `git log --oneline -n <count>` and `git status --short` to confirm the result, and summarize what was committed.

## Hard rules

- **Never** add a `Co-Authored-By` trailer, a "Generated with Claude Code" line, a `Claude-Session` line, or any attribution to Claude / an AI assistant. Commit messages must contain no such trailers whatsoever.
- **Never** run `git push` — committing only. The user pushes when they choose.
- **Never** amend or rebase existing commits unless the user explicitly asks.
- **Never** use `--no-verify` or skip hooks. If a pre-commit hook fails, report it and let the user decide.
- If the working tree is clean (nothing to commit), say so and stop.

$ARGUMENTS
