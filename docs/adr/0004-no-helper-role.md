# 0004. No `HELPER` role in v1; role types are data

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

The PRD left one decision explicitly open before the schema could be written:
do Rovers and Rangers over 18 who help with a younger section get
`ASSISTANT_SECTION_LEADER`, or a distinct `HELPER` role with narrower access?

The question matters because it gates adult-to-child data access, and the PRD
judged it easier to decide now than to migrate later.

## Decision

Neither, for now. No `HELPER` role ships in v1. The role types are those already
listed in the PRD.

Role types are stored as **data**, not as a hardcoded union in application code,
so introducing `HELPER` later is a row and a permission rule — not a schema
migration and not a change to every permission branch.

## Alternatives considered

- **Add `HELPER` now** — a narrow role (mark attendance, view roster names, no
  contact details, no sign-offs). Rejected as speculative: the group has no such
  helper today, and a role with no holder cannot be validated against real use.
- **Use `ASSISTANT_SECTION_LEADER`** — rejected as the default answer. It grants
  full section access including children's contact details, which is a
  safeguarding decision that should be made deliberately when the situation
  actually arises, not inherited by convenience.

## Consequences

- Until a role exists for them, an over-18 Rover helping with a Pack must either
  be given `ASSISTANT_SECTION_LEADER` as an explicit, recorded decision under
  the two-person rule, or not be given system access at all. Both are defensible;
  neither happens silently.
- The permission layer (build step 3) must read role types from the database
  rather than switching on a TypeScript literal union, or this decision buys
  nothing. This is a real constraint on how that layer is written.
- If `HELPER` is added later it needs its own record superseding this one,
  stating what it may and may not see.
