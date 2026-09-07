# 0002. Deletion, erasure, and what the audit log may record

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

The PRD requires an erasure-vs-retention policy before launch, and requires
consent records in the data model from day one. Two operations are commonly
conflated and must not be: reversing a mistake, and discharging a legal
obligation.

A tombstone (`deleted_at` set, row intact) marks a row as gone while leaving it
readable. That is a soft delete. Under the DPDP Act 2023 an erasure request
means the personal data is actually gone, not flagged — so a tombstone alone
does not discharge the obligation.

## Decision

Three distinct operations.

**Soft delete.** `deleted_at` is set; the row is intact and reversible. This is
for a leader deleting the wrong patrol on a Saturday and the Registrar undoing
it on Monday. Audit-logged.

**Erasure.** PII columns are nulled in place. The row and its foreign keys
survive, so attendance history stays countable and the ledger stays balanced;
the person renders as "Former member". Irreversible. Audit-logged.
Authorised by the Data & Safeguarding Officer, never by a section leader.

**Audit log split by PII classification.** Non-PII columns record before and
after values. PII columns record only that they changed, by whom, and when —
never the content.

### PII set on `person`

Nulled on erasure, and never written to the audit log's value columns:

- Name, date of birth, contact details (phone, email, address)
- Photos and badge-evidence images — erasure deletes the R2 objects too, not
  just the database reference. This needs a cleanup job, not just a null.
- Guardian links — otherwise an erased child stays linkable to a named adult.
- Free-text notes — leader-written prose on a person. Personal data hides in
  prose and cannot be erased selectively, so notes are nulled wholesale.

## Alternatives considered

- **Log full before/after values, sweep the log on erasure** — rejected. The
  log stops being append-only, and erasure gains a second write path that can
  fail independently of the first, leaving PII behind in exactly the place
  nobody looks.
- **Never log old values at all** — safe, but discards the main reason to keep
  a log: answering "what did this say before the leader changed it?"
- **Hard-delete the person row** — rejected. Breaks historical rosters and
  ledger totals, which the PRD requires to survive permanently.

## Consequences

- Per-column PII classification is required. This is needed for the erasure
  routine anyway, so one classification serves both purposes.
- No table may denormalise a person's name. Any such copy is a second place
  erasure has to reach, and will eventually be missed. This constrains every
  schema decision that follows.
- Erasure needs an R2 cleanup path, so it cannot be a pure database
  transaction. It should be a recorded, resumable job.
- Retaining awards as the child's own record is not settled here. If a family
  wants a record of what their child earned, generate an exportable certificate
  *before* anonymising. Whether that happens by default is an open question.

## Open questions

- **Do free-text safeguarding notes have a retention basis that survives an
  erasure request?** They are classified as PII and erased here. A safeguarding
  concern recorded about a child may have an independent legal basis for
  retention that outlives consent withdrawal. This needs the DPDPA reviewer's
  opinion before launch, not a developer's guess.
- Whether an award certificate is generated automatically on erasure or only on
  request.
