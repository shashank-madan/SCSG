# 0007. Better Auth does authentication only; the domain model is ours

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

Better Auth ships an organization plugin whose shape resembles this domain
closely enough to be worth investigating before building the equivalent by hand:

```
organization  → id, name, slug, logo, metadata
  team        → id, name, organizationId, memberCount
  member      → userId, organizationId, role, teamId
  invitation  → email, role, status, expiresAt, inviterId
```

The tempting mapping is organization = group, team = section, member =
membership. It does not survive contact with the requirements.

## Decision

Better Auth provides authentication only: `user`, `session`, `account` and
`verification`, plus Google sign-in and the admin plugin's impersonation. The
organization plugin is not used. Person, section, sub-unit, membership,
crossover, scoped roles and consent are all ours.

### Why the organization plugin does not fit

**`member.userId` is required, and most people here have no login.** This is
disqualifying on its own. Better Auth's member hangs off `user`, so membership
without an account is inexpressible — but an eight-year-old Bulbul with a
membership and no credentials is the central case, not an edge case.

**`member.role` is a column on the membership.** The PRD opens §4 by ruling
that out: a role column loses multi-role people, history and crossover at once.
`member.teamId` has the same problem in the other direction — one team per
member, no history.

**Nothing is time-bounded.** There is no `joined_at`/`left_at` or
`valid_from`/`valid_to`; membership is present-tense. The crossover model —
close a membership, open a new one, link them, keep both forever — has nowhere
to live, and permanent progression history across crossover is the PRD's first
success criterion.

**Multi-tenancy that does not exist here.** `organization` separates tenants.
This is one group, and adopting the plugin would mean carrying an
`organization_id` on every row in perpetuity to express that.

### The admin plugin is used

It provides impersonation, which the PRD names as the primary support tool for
helping confused parents.

Its `user.role` column ("admin" / "user") is **not** the scouting role model. It
gates Better Auth's own admin endpoints and nothing else. Scouting authority
lives in `role_assignment`; a `SECTION_MASTER` must never be a Better Auth
admin. The PRD restricts impersonation to platform roles — Registrar,
Superadmin — and never to section leaders.

## Consequences

- Four generated tables to accommodate (`user`, `session`, `account`,
  `verification`) and no more. No `organization_id` threaded through the schema,
  and no second membership model to reconcile with our own.
- `person.user_id → user.id`, nullable, is the entire integration surface.
- Permission resolution, scope checking and role labelling are ours to write and
  ours to get right. Better Auth answers "who is this browser", never "what may
  they do".
- If Better Auth is ever replaced, the blast radius is those four tables and the
  sign-in flow. The domain model is untouched — which is a consequence worth
  having.
