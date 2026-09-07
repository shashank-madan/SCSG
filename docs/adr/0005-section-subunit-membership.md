# 0005. Sections, sub-units, and how people are assigned to them

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

The PRD models `membership` as a person's time-bounded belonging to a *section*,
and separately mentions sub-unit (Six / Patrol) assignment as part of the
membership module. It does not say how the two relate.

They change at very different rates. A Cub's Pack membership typically runs for
years unbroken, while their Six can change several times within one of those
years. Any model that ties the two together has to distort one of them.

## Decision

### Structure

```
section          Pack, Flock, Troop, Company, Crew, Team
  └── subUnit    a Six in a Pack, a Patrol in a Troop
```

A sub-unit belongs to exactly one section, permanently. If a section closes, its
sub-units close with it. `sub_unit.section_id` is immutable in practice.

`section_type` is a constrained text column on `section`, not a lookup table.
The PRD derives display labels from `role_type × section_type` in code, so a
table of types would carry no information the code does not already hold.

### One section per type, for now

A unique constraint on `section_type` limits the group to one Pack, one Troop
and so on. Groups do outgrow a single section, and the cost of that assumption
is not a migration — it is every query, roster view and permission check that
treated the type as the section's identity.

So the constraint is the *only* thing enforcing it. `section` has its own `id`
and `name` from the outset, nothing joins on `section_type`, and lifting the
limit later means dropping one index.

### Sub-unit assignment is its own table

`membership` records section belonging. A separate `sub_unit_membership` records
Six or Patrol belonging, time-bounded independently.

Rejected: a `sub_unit_id` column on `membership`. Changing Six would mean either
mutating the row, which the PRD's fourth architectural principle forbids, or
closing the membership and opening a new one, which would falsely record the
child as having left the Pack and rejoined it.

Two things the separate table buys:

- Sub-unit history survives. "Who was in Tiger Six when they won the camp
  trophy" is answerable, and it is the kind of question a scout group asks.
- A child between Sixes is representable, rather than requiring a placeholder.

The cost is one extra table and a join on roster queries, which is acceptable at
a few hundred people.

## Consequences

- Two independent time-bounded tables now describe where a person belongs.
  Both must be closed at crossover, and a sub-unit membership must not outlive
  the section membership that contains it. Nothing in the database enforces
  that; it belongs in the crossover action.
- Roster queries join `membership` and `sub_unit_membership` and must filter
  both by date.
- The single-section-per-type constraint is a deliberate simplification with a
  known exit. If a second Pack is ever opened, the work is dropping the unique
  index — provided nothing has started treating `section_type` as an identity in
  the meantime. That is the thing to guard in review.
