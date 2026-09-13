# 0006. Consent is a per-purpose record, not a flag

- **Status:** Accepted
- **Date:** 2026-09-07
- **Deciders:** shashank-madan

## Context

The DPDP Act 2023 requires verifiable parental consent to process a child's
personal data, and the app's entire purpose is processing children's data.
Consent is therefore the lawful basis for holding any of it — not a feature.

"The parents obviously agreed when they enrolled" is true and insufficient:
DPDPA requires consent to be *verifiable*, and a paper form in a folder is not
retrievable a year later when a parent asks what they agreed to.

The first draft put `consent_given_at`, `consent_method` and
`consent_withdrawn_at` directly on `guardian_link` — a single flag covering
everything the app does.

## Decision

Consent is recorded per purpose, in its own `consent_record` table. The columns
on `guardian_link` are removed; two places recording consent would drift, which
is precisely what ADR 0002 warns against.

### Why per purpose

These are not the same ask, and bundling them makes the consent weaker:

| Purpose | Nature |
|---|---|
| Membership records — name, DOB, attendance, progress | Necessary; refusing means the child cannot be a member |
| Photos in group communications | Optional |
| Photos published publicly — website, social, press | Optional, and the one most often refused |
| Contact details visible to other families | Optional |

Under DPDPA, consent bundled across unrelated purposes tends not to count. More
practically: "no photos on the website please" is a thing parents say, and a
single flag gives it nowhere to live.

### Event consent shares the table

Camp and event permission is the same shape — a guardian saying yes to something
for a child, with a date and a method — so it uses the same table, with a
nullable `event_id` distinguishing standing consent from consent for one event.

What must *not* happen is event-specific detail (medical information, dietary
needs, emergency contact, pickup arrangements) accumulating on this table. That
belongs to the event module. This table records that consent was given, by whom,
when, and how.

`event_id` is deliberately unconstrained for now: there is no `event` table yet,
and inventing one to satisfy a foreign key would be designing the events module
prematurely. The FK is added when that table exists.

## Alternatives considered

- **Single flag on `guardian_link`** — rejected as above. Simplest, but bundles
  unrelated purposes and cannot express a photo refusal.
- **Two flags, essential and optional** — covers the photo case without a table,
  but has no room for event consent and no record of *which* optional thing was
  agreed to.
- **A separate table for event consent** — rejected. Two tables meaning "a
  guardian said yes" would need two UIs, two reminder flows and two versions of
  "who has not replied yet".

## Consequences

- Absence of a consent record means no consent. The application must treat a
  missing row as refusal, never as "probably fine".
- Withdrawal is a new value on the record, not a deletion — the fact that a
  family once consented and later withdrew is itself worth keeping, and DPDPA
  requires withdrawal to be as easy as giving.
- Purposes are stored as data, so adding one is a row. Consent already given
  cannot be retroactively extended to a new purpose: a new purpose starts with
  nobody having consented to it, which is the correct default.
- The photo-publishing purpose gates real behaviour. Any view that renders a
  child's photo outside the app must check it, and that check is the kind of
  thing that gets forgotten. It belongs in a helper, not in each view.
