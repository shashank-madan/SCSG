# 0001. Append-only tables and an audit log, not event sourcing

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

The PRD already requires history to survive: memberships close rather than
mutate, the ledger is append-only with reversal entries, role assignments are
time-bounded, and progression records must outlive section crossover
permanently. Those are event-sourcing instincts, so the question arose
naturally: should the whole system be event-sourced, with entity state derived
from a log of events?

## Decision

No. We keep ordinary mutable tables, with append-only discipline where history
matters (ledger, membership, role assignment, sign-offs), temporal columns
(`valid_from` / `valid_to`), an audit log, and merge pointers for identity
repair.

## Alternatives considered

- **Full event sourcing** — rejected on four grounds:
  - **Volunteer maintainers.** Every read goes through a projection;
    projections drift, need rebuild tooling, and fail in ways that are hard to
    diagnose. The PRD names the bus factor as a known risk. Event sourcing
    roughly doubles the conceptual load on whoever inherits this in three
    years, and that person is also a volunteer.
  - **It makes erasure harder, not easier.** An immutable event log is
    immutable by design, so a DPDPA erasure request cannot be satisfied by
    nulling a column. The standard remedy is crypto-shredding — per-subject
    encryption with key deletion — which is real work and an ongoing
    key-management burden. Mutable rows with nullable PII are genuinely
    simpler to erase. See [[0002-deletion-erasure-and-audit]].
  - **No admin panel.** The PRD already flags hand-building every back-office
    screen as the largest hidden cost. Event sourcing adds projection-rebuild
    tooling to that pile.
  - **Learning cost.** The maintainer is learning TypeScript and React on this
    project. Event sourcing would dominate that budget.

- **CQRS without a full event store** — same projection-drift problem, less of
  the benefit. Not worth the split.

## Consequences

- "Who was in the Pack in March 2024" is answered by a date-range query over
  `membership`, not by replaying a log.
- "Who changed this, and when" is answered by the audit log.
- Identity repair (duplicate person merges) uses a `merged_into_id` pointer on
  `person`: the losing row survives, points at the winner, and reads follow the
  pointer. Reversible and auditable. This must be in the schema from the start —
  retrofitting a merge is painful.
- We give up free time-travel to arbitrary past states. Accepted: the two
  questions that mattered are covered above.
- If a future module genuinely needs a full event log, it can have one locally
  without converting the whole system.
