# Architecture Decision Records

Each ADR captures one technical decision: what we chose, what we gave up, and why.

| # | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](./0001-no-event-sourcing.md) | Append-only tables and an audit log, not event sourcing | Accepted | 2026-09-07 |
| [0002](./0002-deletion-erasure-and-audit.md) | Deletion, erasure, and what the audit log may record | Accepted | 2026-09-07 |
| [0003](./0003-soft-delete-scope.md) | Where `deletedAt` belongs, and where it must not | Accepted | 2026-09-07 |
| [0004](./0004-no-helper-role.md) | No `HELPER` role in v1; role types are data | Accepted | 2026-09-07 |
| [0005](./0005-section-subunit-membership.md) | Sections, sub-units, and how people are assigned to them | Accepted | 2026-09-07 |
| [0006](./0006-consent-records.md) | Consent is a per-purpose record, not a flag | Accepted | 2026-09-07 |
| [0007](./0007-better-auth-scope.md) | Better Auth does authentication only; the domain model is ours | Accepted | 2026-09-07 |
| [0008](./0008-minimal-role-set.md) | Seven roles, and no two-person rule | Accepted | 2026-09-07 |

Start from [`TEMPLATE.md`](./TEMPLATE.md).
