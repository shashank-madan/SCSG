# 0003. Where `deletedAt` belongs, and where it must not

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

[[0002-deletion-erasure-and-audit]] established three operations: soft delete,
erasure, and audit logging. This record answers the follow-on question — which
tables carry `deleted_at`.

Hard `DELETE` is unusable here. Every foreign-key action on a referenced row is
wrong for this domain: `CASCADE` silently destroys a child's scouting history on
a mis-click, `RESTRICT` makes deletion impossible once any history exists, and
`SET NULL` leaves dangling references that quietly corrupt historical roster
counts. Soft delete avoids all three because the row never leaves, so the
foreign key is never tested and no cascade ever fires.

## Decision

`deleted_at` goes only on tables where deletion is a meaningful user action with
a recovery story. It is deliberately absent elsewhere.

**Carries `deleted_at`** — a leader can delete this by mistake and want it back:
`person`, `section`, `sub_unit`, `announcement`, `meeting`.

**Must not carry `deleted_at`** — append-only per
[[0001-no-event-sourcing]]; these are *closed*, not deleted:

- `membership` — closed with `left_at` and `end_reason`. A membership that ended
  is not deleted; it happened.
- `role_assignment` — closed with `valid_to`.
- `ledger_entry` — never removed. Corrections are reversal entries. A
  `deleted_at` here would let someone quietly un-post a payment, which is
  precisely what append-only exists to prevent.
- `audit_log` — the record of what happened cannot itself be retractable.

**Neither** — deletion is just undoing an entry, with no recovery story worth
building: `attendance_record`. Unmarking someone means the record should not
have existed.

### Three states, not two

Erasure is orthogonal to deletion, so `erased_at` is a separate column and not a
value of `deleted_at`:

| State | `deleted_at` | PII |
|---|---|---|
| Active | `NULL` | present |
| Deleted | set | present — recoverable, hidden from lists |
| Erased | either | `NULL` — irreversible, row and FKs survive |

An erased person may still be an active member. Erasure on request while a child
still attends is unusual but lawful, and the model must not forbid it.

## Alternatives considered

- **`deleted_at` on every table** — rejected. On the append-only tables it would
  create a second, weaker way to make history disappear, defeating
  [[0001-no-event-sourcing]]. Uniformity is not worth that.
- **Hard delete with `ON DELETE RESTRICT`** — rejected as above: correct but
  unusable once any row has history, which is immediately.

## Consequences

- **The database no longer enforces this.** Postgres enforced foreign keys for
  free; nothing enforces "exclude soft-deleted rows". That filter is now the
  application's responsibility in every query, forever, and missing it once puts
  a deleted person back on a roster. This is the standard soft-delete failure
  mode and the main cost of this decision.
- **Mitigation: no query touches these tables directly.** Reads go through
  helpers that apply the filter, so omitting it requires visibly bypassing the
  helper.
- TypeScript cannot help by default — a soft-deleted `Person` has the same type
  as a live one. Where it is worth the ceremony (`person`), the helper returns
  only live rows and an explicit `includeDeleted` path returns the wider type.
- Unique constraints must account for soft-deleted rows. A deleted section named
  "Pack A" still occupies that name unless the constraint is partial
  (`WHERE deleted_at IS NULL`).
