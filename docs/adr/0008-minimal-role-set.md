# 0008. Seven roles, and no two-person rule

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

The PRD's §4 listed eleven role types, including Treasurer, Secretary,
Registrar and a Data & Safeguarding Officer, and required a two-person rule:
granting any role with access to children's data needs the group leader plus a
second recorded approver.

Both were written before anyone asked who would actually hold these roles.

## Decision

Seven role types ship:

| | |
|---|---|
| **Adult** | `GROUP_LEADER`, `SECTION_MASTER`, `ASSISTANT_SECTION_MASTER` |
| **Youth** | `SECTION_LEADER`, `SUB_UNIT_LEADER`, `SUB_UNIT_SECOND` |
| **Platform** | `SUPERADMIN` |

Dropped: `TREASURER`, `SECRETARY`, `REGISTRAR`, `DATA_SAFEGUARDING_OFFICER`.
The two-person rule is dropped with them, along with the
`approved_by_person_id` column and its constraint.

### Why

**Treasurer and Secretary are committee positions, not access levels.** Being
the treasurer describes handling money in the real world. It does not describe a
set of things the app must let someone do that the group leader cannot — and v1
payments are manual UPI with leader confirmation, which needs no such role.

**Registrar and Data & Safeguarding Officer existed mostly to serve the
two-person rule.** With that rule gone, they have no distinct job left that the
group leader does not already do.

**A rule needs enough people to satisfy it.** A two-person rule with one
available adult is either bypassed or blocks the work. Safeguarding suspension
that requires two approvers at 11pm on a Sunday is a control that fails exactly
when it is needed. The audit log — who granted what, when — is the control that
actually holds in a volunteer group of this size.

**Roles nobody holds are complexity in every permission check.** Each one is a
branch to write, test and read past, in code a future volunteer has to
understand.

## Alternatives considered

- **Keep Registrar and Data & Safeguarding Officer** — argued for on the
  grounds that a two-person rule needs a second person, and out-of-hours
  safeguarding needs someone reachable. Rejected together with the rule itself.
- **Two-person rule with any two `GROUP_LEADER`s** — would mean several people
  holding full authority over everything, which is a worse outcome than the
  single-approver grant it was meant to improve on.

## Consequences

- The audit log becomes the only record of who granted authority to whom. It has
  to be reliable, and it has to be reviewed by someone occasionally, or this
  decision has removed a control and replaced it with nothing.
- Safeguarding suspension is still required by the PRD and still must be
  instant. It is now a `GROUP_LEADER` action.
- Adding any of the dropped roles later is a row, per
  [[0004-no-helper-role]] — and by then it can be shaped around what the person
  holding it actually does, rather than what a document guessed in advance.
- If the group ever grows past a few hundred, or a safeguarding incident occurs,
  the two-person rule deserves revisiting. That would supersede this record.
