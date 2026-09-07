# Sri Chamundi Scout Group — Group Management Platform

**Product Requirements Document — v0.1**
Status: pre-implementation. Data model and auth architecture decided; schema not yet written.

---

## 1. Context

Sri Chamundi Scout Group is a Bharat Scouts & Guides unit in India. The group currently manages membership, attendance, badge progression, fees and communication through paper records, spreadsheets and WhatsApp. This fragments records, makes progression history unreliable across section crossover, and creates no durable record of who was in which unit when.

The platform is built and maintained by volunteers, for a group of a few hundred people. It is not a commercial product and has no budget beyond an existing `.org` domain.

### Constraints that shaped every decision

- **No budget.** Target running cost is ₹0/month. The domain is already owned.
- **Volunteer maintainers.** One or two part-time developers. Whoever inherits this in three years is also a volunteer.
- **Low-end Android on patchy mobile networks.** Assume 3G, assume cheap phones.
- **Children's data.** DPDP Act 2023 applies. Safeguarding obligations apply independently of the law.
- **Camps have no signal.** Attendance must work fully offline.

### Success criteria for v1

1. Every member's progression history survives crossover between sections, permanently.
2. A leader can take attendance at a camp with no network and have it sync later without loss.
3. A parent can see their own child's progress and fee status without a leader relaying it.
4. Running cost stays at ₹0/month and no unexpected bill is ever possible.

---

## 2. Scope

### In scope for v1

| Module | Description |
|---|---|
| Membership management | Person records, section memberships, sub-units, crossover |
| Attendance tracking | Offline-first roll-taking per meeting, per section/sub-unit |
| Progress tracking | Badge and Sopan requirements, sign-offs, evidence |
| Announcements | Group and section-scoped notices, web push |
| Learning modules | Delivery of training content to members |
| Payments | Manual UPI collection with leader confirmation |
| Ledger | Categorised income/expense with CSV export |
| Parent dashboard | Scoped read access to own children's records |

### Explicitly out of scope

**In-app chat.** WhatsApp has effectively 100% adoption among this user base; a worse version is the most expensive item on the original list. Independently, private adult-to-minor messaging is a safeguarding risk a youth organisation should not create without strong reason. If ever revisited: no private adult–child DMs, all messages logged and visible to a second leader.

**Double-entry accounting.** A categorised ledger plus CSV export to the treasurer's existing tool delivers most of the value for a fraction of the work.

**Payment gateway integration.** Deferred, not rejected — see §7.

**Native mobile apps.** PWA only.

---

## 3. Technical decisions

### Stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (React, SSR, typed server functions) |
| ORM | Drizzle |
| Validation | Zod at every boundary |
| Auth | Better Auth |
| Database | Neon (Postgres) |
| Compute/hosting | Cloudflare Workers |
| Object storage | Cloudflare R2 |
| Cron | GitHub Actions |
| Errors | Sentry or self-hosted GlitchTip |
| PDF | Client- or worker-side HTML→PDF for receipts and certificates |

### Rationale

**TanStack Start over Next.js.** Typed search params matter for an app dominated by filtered list views (members by patrol, attendance by date range, payments by status). Filters live in the URL as Zod-validated objects, so shared links and back-button behaviour work by construction. Server functions are typed end-to-end and TanStack Query is native, which the offline attendance module depends on. Cost: a younger ecosystem and fewer answers when stuck.

**TanStack Start over Django.** Django's admin would have been worth months of work for a CRUD-shaped app like this. Type safety was prioritised instead. **Consequence: there is no admin panel. Every back-office screen must be hand-built. This is the largest hidden cost in the plan and the most likely cause of schedule overrun.** Drizzle Studio covers direct table inspection for developers, not for volunteers.

**Better Auth over Neon Auth or a hosted provider.** Auth tables live in the application schema, so `person.user_id → user.id` is an ordinary Drizzle join. The admin plugin provides impersonation, which is the primary support tool for helping confused parents. Custom fields on the user table work natively. Cost: roughly a day or two of setup, and operating auth is the maintainer's responsibility.

**Neon over Supabase.** Better free-tier recovery (6h instant restore plus a manual snapshot, versus none on Supabase free), 100 projects means free staging, and branch-per-PR. Independently validated in February 2026 when India DNS-blocked `*.supabase.co` under Section 69A and apps went dark for 7–8 days.

**Cloudflare Workers over Netlify or AWS Lambda.** Workers run at Indian edge locations (Mumbai, Chennai, Delhi, Bangalore, Hyderabad), so compute is in-country — Netlify's free tier runs functions in a US region. Neon's HTTP serverless driver fits Workers without TCP pooling. Free tier is 100k requests/day. Lambda would be equally free at this volume but AWS keeps billing past its limits rather than failing closed, and post-July-2025 Free Plan accounts auto-close after six months. Cost of Workers: `nodejs_compat` is not full Node, so some libraries will need swapping.

### Architectural principles

1. **Free tiers must fail closed, not bill.** An outage is recoverable by a volunteer on Monday. An invoice is a committee meeting.
2. **No third-party domain in the browser's critical path.** The browser resolves only `*.yourdomain.org`. The database is reached server-side from Workers; R2 is served from `media.yourdomain.org`, never `r2.dev`. A block on a vendor domain must not reach users.
3. **Cut anything an existing tool does better.**
4. **Never mutate history.** Close records and open new ones. Corrections are new rows, not edits.

---

## 4. Auth and identity architecture

This is the section most expensive to change later. It is decided.

### The four separate concepts

Role is **never** a column on the user. That loses multi-role people, history, and crossover simultaneously.

- **Person** — the durable human. Created once, never deleted. Holds name, DOB, contact.
- **Login account** — Better Auth's `user`. Linked from `person` by a **nullable** FK. Not every member has one: an 8-year-old Bulbul is a person with a membership and no credentials; her mother is a person with credentials and a guardian link.
- **Membership** — a person's time-bounded belonging to a section. A child accumulates several over a scouting lifetime.
- **Role assignment** — a scoped, time-bounded grant of authority.

### Abstract the role, derive the label

Cub Master, Flock Leader, Scout Master, Guide Captain and Rover Scout Leader have identical permissions over their own section. Model one role, not five.

`SECTION_LEADER` scoped to a section. The display label is derived from `role_type × section_type`. Adding Rangers means adding a section type and a label mapping — not a permission branch.

**Section types:** Pack (Cubs), Flock (Bulbuls), Troop (Scouts), Company (Guides), Crew (Rovers), Team (Rangers).

**Role types:**

| Role | Scope | Notes |
|---|---|---|
| `GROUP_LEADER` | Group | GSM |
| `SECTION_LEADER` | Section | Label derived per section type |
| `ASSISTANT_SECTION_LEADER` | Section | |
| `YOUTH_SENIOR` | Section | Troop Leader / Company Leader |
| `YOUTH_LEADER` | Sub-unit | Renders "Sixer" in a Pack, "Patrol Leader" in a Troop |
| `YOUTH_SECOND` | Sub-unit | "Second" in both |
| `TREASURER` | Group | |
| `SECRETARY` | Group | |
| `GUARDIAN` | Person(s) | Derived from guardian links |
| `MEMBER` | — | Baseline |

### Scope

Every role assignment carries: scope type (`GROUP` | `SECTION` | `SUB_UNIT`), target id, `valid_from`, `valid_to`.

**Permissions are computed from active assignments at request time. Never stored as booleans** — stored permissions drift from reality and become a security bug.

### Crossover without data loss

**Rule: close a membership, open a new one. Never mutate.**

```
membership:
  person_id
  section_id
  joined_at
  left_at
  end_reason: crossover | moved | aged_out | left
  crossed_to_membership_id
```

A Cub becoming a Scout gets `left_at` and `end_reason = crossover` on the old row, plus a new row on the Troop, linked. Both persist forever. "Show the Pack roster in March 2024" is a date-range query.

Two consequences:

- **Progress records hang off `person`, not membership** — but store the membership they were earned under, so a Cub's Pravesh is distinguishable from a Scout's Pravesh, and a Rover can still see what they earned at eight.
- **Crossover is an explicit leader action, never derived from DOB.** Real crossover happens at a ceremony, sometimes late, sometimes early. Age is a prompt, not a trigger.

Youth role assignments end automatically at crossover. Adult ones do not — a Scout Master moving to the Crew keeps a closed assignment and gains a new one.

### Platform roles (separate from scouting authority)

A Scout Master is qualified to lead a Troop. That says nothing about whether they should be able to merge person records. These are **platform responsibilities**, assigned independently.

| Platform role | Owns |
|---|---|
| **Registrar** | Identity repair (duplicate person merges, re-binding a login to the right person); correcting history (backdating memberships, fixing mis-recorded crossovers); annual rollover and re-registration; section lifecycle (opening a Ranger Team, closing an empty Crew) |
| **Treasurer** | Refunds, write-offs, reversing misposted payments. Ledger is **append-only** — corrections are reversal entries, never deletes. The person who records payments must not be the only one who can adjust them. |
| **Data & Safeguarding Officer** | DPDPA administration (recording and withdrawing parental consent, access and erasure requests); erasure-vs-retention decisions; **safeguarding suspension**; audit review |
| **Superadmin** | Break-glass only. Assigned to a named individual, logged loudly, used almost never. |

Cross-cutting requirements:

- **Granting adult roles requires GSM plus a second recorded approver.** Any role granting access to children's data goes through a two-person rule. Cheap to build, valuable if anything ever goes wrong.
- **Safeguarding suspension must revoke all access instantly without deleting any record, in one click, available to the GSM at 11pm on a Sunday.** Design for this now, not later.
- **Impersonation is always logged, never silent, and never available to section leaders.**
- **Editing the past is categorically different from editing the present.** Separately gated, always logged.

### ~~Open decision — resolve before writing the schema~~ — Resolved

~~Do Rovers and Rangers over 18 who help with a Pack get `ASSISTANT_SECTION_LEADER`, or a distinct `HELPER` role with narrower access?~~

**Resolved by [ADR 0004](../adr/0004-no-helper-role.md):** neither ships in v1. Role types are stored as data, so `HELPER` can be added later as a row rather than a migration. Until then, an over-18 helper is either granted `ASSISTANT_SECTION_LEADER` as an explicit recorded decision under the two-person rule, or given no system access.

---

## 5. Compliance and safeguarding

**DPDP Act 2023.** Verifiable parental consent is required for under-18s, and behavioural tracking or targeted advertising directed at children is prohibited. Consent records must be **in the data model from day one** — retrofitting them is painful, modelling them upfront is nearly free.

Name a specific person as data protection contact. This is a role with legal weight, not an IT task.

**Erasure vs retention policy — must be written before launch.** A family leaves and requests deletion; this collides directly with "retain data permanently." Decide in writing what is anonymised, what is retained (awards earned are arguably the child's own record), and what is genuinely purged.

**Get someone familiar with DPDPA to review the consent flow before launch.**

---

## 6. Module requirements

### Membership

Person CRUD, guardian links, section memberships, sub-unit (Six/Patrol) assignment, crossover action, roster views scoped by role and by date.

### Attendance — offline-first

The only module that must work with no network, because that is exactly where camps happen. PWA with IndexedDB queueing and a sync queue; TanStack Query persister with optimistic mutations; Workbox service worker. Conflict resolution: last-write-wins per (meeting, person) is acceptable; log both.

### Progress tracking

**Badge and Sopan requirements are database rows, not code.** Progression (Pravesh → Pratham/Dwitiya/Tritiya Sopan → Rajya Puraskar → Rashtrapati Puraskar) plus proficiency badges. Each sign-off records who verified, when, and optional evidence photo (R2). When BSG revises the syllabus, someone edits rows rather than waiting for a deploy.

### Announcements

Group- and section-scoped notices with web push. WhatsApp deep links for broadcast.

### Learning modules

Content delivery to members. Scope deliberately minimal in v1.

### Payments and ledger

See §7. Append-only ledger, categorised, CSV export.

### Parent dashboard

Scoped read access to own children only: progress, attendance, fee status, announcements. Permission derived from active guardian links, checked server-side.

---

## 7. Deferred decisions

**Payments — manual UPI in v1.** Generate a UPI intent link or QR per invoice; parent pays and submits the UTR; a leader confirms. Zero fees, no business KYC (which an unregistered group may not clear), and UPI is universal in India. Revisit a gateway (Razorpay, ~2% + KYC) when manual reconciliation becomes a burden — realistically somewhere north of a hundred families.

**Auth method — Google Sign-In plus email/password fallback.** SMS OTP is deliberately avoided: TRAI's DLT regime requires registering the entity, sender header and every template before a single transactional SMS can be sent — weeks of paperwork plus per-message cost, for something Google does free.

---

## 8. Operations

- **Neon region must match the Workers deployment.**
- **Backups are the maintainer's responsibility, not the vendor's.** Nightly `pg_dump` to R2, 30-day retention, via GitHub Actions. Neon's 6h restore window does not cover the realistic disaster: a leader deletes the wrong patrol and nobody notices until Saturday. **Restore a dump into a scratch database before launch — an untested backup is not a backup.**
- **Uploaded photos go to R2, never to compute storage.**
- **Staging:** separate Neon project (free), branch-per-PR for migrations.
- **Never let anyone bookmark a `*.workers.dev` URL.** Custom domain from day one — shared vendor subdomains have been blocked wholesale by ISPs in other jurisdictions.

---

## 9. Known risks accepted

| Risk | Nature |
|---|---|
| No admin panel | Every back-office screen hand-built. Largest hidden cost; most likely schedule overrun. |
| TanStack Start is young | Fewer answers when stuck; the maintainer is the bus factor. |
| Workers runtime | `nodejs_compat` is not full Node; some libraries will need swapping. |
| Manual UPI reconciliation | Stops scaling past roughly a hundred families. |
| Free tier changes | Vendors can change terms. Mitigated by Postgres portability and no vendor lock-in beyond Neon and R2. |

---

## 10. Suggested build order

1. **Schema first** — person, user link, guardian links, section, sub-unit, membership, role assignment, consent records. Everything else depends on getting this right.
2. Better Auth wiring, Google Sign-In, person↔user binding.
3. Permission resolution from active role assignments; server-function guard helpers.
4. Membership CRUD and roster views.
5. Attendance, offline-first.
6. Progress tracking with data-driven requirements.
7. Parent dashboard.
8. Announcements.
9. Payments and ledger.
10. Learning modules.

Platform-role tooling (Registrar merges, safeguarding suspension, audit log) should land alongside step 4, not be deferred to the end. Safeguarding suspension in particular is not a v2 feature.

---

## Decisions taken since v0.1

- Event sourcing considered and rejected — [ADR 0001](../adr/0001-no-event-sourcing.md)
- Deletion, erasure and audit-log rules — [ADR 0002](../adr/0002-deletion-erasure-and-audit.md), which settles the §5 erasure-vs-retention question for the schema, leaving the safeguarding-notes retention basis open for the DPDPA reviewer.
- Which tables carry `deleted_at`, and which are append-only instead — [ADR 0003](../adr/0003-soft-delete-scope.md)
- The §4 `HELPER` question, resolved — [ADR 0004](../adr/0004-no-helper-role.md)
