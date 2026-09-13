/**
 * The `person` table: the durable human record.
 *
 * A person is created once and never deleted. Their PII can be erased,
 * and the row can be soft-deleted (leader mistake), but the
 * row itself and its foreign keys survive forever so that historical rosters,
 * attendance counts and ledger entries stay intact.
 *
 * See docs/adr/0002-deletion-erasure-and-audit.md and
 * docs/adr/0003-soft-delete-scope.md.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	date,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const person = pgTable(
	"person",
	{
		// ---------------------------------------------------------------------
		// Identity
		// ---------------------------------------------------------------------

		/**
		 * UUID rather than a serial integer, for two reasons that matter here:
		 *
		 * 1. Offline attendance. A leader marking a roll call at a camp with no
		 *    signal needs to create rows the server has never seen. A serial id
		 *    requires a round trip to the database to find out what the next
		 *    number is; a UUID can be generated on the phone. The PRD makes
		 *    offline-first non-negotiable, so ids must be client-generatable.
		 * 2. Ids leak information. Sequential ids tell anyone who sees one how
		 *    many children are in the group and roughly when each joined.
		 *
		 * `defaultRandom()` means Postgres fills it in when we don't supply one.
		 */
		id: uuid("id").primaryKey().defaultRandom(),

		// ---------------------------------------------------------------------
		// PII — every column in this block is nulled on erasure.
		// See ADR 0002. If you add a column here, add it to the erasure routine.
		// ---------------------------------------------------------------------

		/**
		 * Names are one text field, not first/middle/last.
		 *
		 * Indian naming conventions do not reliably decompose into that shape:
		 * many people have a single mononym, others use initials expanding to a
		 * father's name or village, and the ordering varies by region. Splitting
		 * the field forces volunteers to make a wrong choice on data entry.
		 *
		 * `.notNull()` on a live person, but erasure needs to clear it — so it
		 * is nullable at the database level and the CHECK constraint at the
		 * bottom of this file enforces "present unless erased" instead.
		 */
		fullName: text("full_name"),

		/**
		 * `date` not `timestamp`: a birthday is a calendar date, not an instant.
		 * Storing it as a timestamp introduces a timezone, and a child born on
		 * 1 January in IST becomes 31 December in UTC — which then shifts their
		 * age, and therefore their section eligibility, by a year.
		 */
		dateOfBirth: date("date_of_birth"),

		/**
		 * Contact details. Nullable for a reason beyond erasure: an 8-year-old
		 * Bulbul has no phone and no email. Her guardian's contact details live
		 * on the guardian's own person row, reached through a guardian link.
		 *
		 * Never copy a guardian's phone number onto a child's row. ADR 0002
		 * forbids denormalising PII, because every copy is a second place an
		 * erasure request has to reach, and one will eventually be missed.
		 */
		phone: text("phone"),
		email: text("email"),
		address: text("address"),

		/**
		 * Free-text leader notes. Classified as PII and erased wholesale,
		 * because personal data hides in prose and cannot be removed selectively.
		 *
		 * Open question in ADR 0002: safeguarding notes may have a retention
		 * basis that outlives a consent withdrawal. That is a legal question
		 * pending the DPDPA reviewer, not a decision to make in the schema.
		 */
		notes: text("notes"),

		/**
		 * Object key of the profile photo in R2 — not a URL.
		 *
		 * Storing the key rather than a full URL means the bucket, custom domain
		 * or signing scheme can change without rewriting every row. The PRD
		 * requires media to be served from `media.yourdomain.org` and never
		 * `r2.dev`, and that mapping belongs in one place in code.
		 *
		 * Erasure must delete the R2 object too, not just null this column.
		 */
		photoKey: text("photo_key"),

		// ---------------------------------------------------------------------
		// Lifecycle — three independent states. See ADR 0003.
		// ---------------------------------------------------------------------

		/**
		 * Soft delete: recoverable, PII intact, hidden from normal queries.
		 * A leader deletes the wrong person on Saturday; the Registrar restores
		 * them on Monday.
		 *
		 * Nothing in the database enforces "exclude soft-deleted rows" — that
		 * filter is the application's job in every single query. This is the
		 * main cost of soft deletion and its standard failure mode. Read through
		 * the query helpers rather than touching this table directly.
		 */
		deletedAt: timestamp("deleted_at", { withTimezone: true }),

		/**
		 * Erasure: irreversible, PII gone, row and foreign keys survive.
		 *
		 * Separate from `deletedAt` rather than a state of it, because the two
		 * are orthogonal — an erased person may still be an active member.
		 * Erasure on request while a child still attends is unusual but lawful,
		 * and the model must not forbid it.
		 */
		erasedAt: timestamp("erased_at", { withTimezone: true }),

		/**
		 * Identity repair: when the Registrar merges duplicate person records,
		 * the losing row stays and points at the winner. Reads follow the
		 * pointer. Reversible, auditable, and far cheaper than a real merge.
		 *
		 * This is a self-referencing foreign key, and it is the one place the
		 * type system needs help. `person` is still being defined on this line,
		 * so TypeScript cannot infer the type of `person.id` yet — it would have
		 * to know the answer to finish computing the question. The explicit
		 * `: AnyPgColumn` return type breaks that circularity by telling the
		 * compiler what to expect instead of asking it to work it out.
		 *
		 * The arrow function matters too: it defers the lookup until after the
		 * table exists at runtime. Writing `references(person.id)` directly
		 * would read `person` before the assignment completes.
		 */
		mergedIntoId: uuid("merged_into_id").references(
			(): AnyPgColumn => person.id,
		),

		// ---------------------------------------------------------------------
		// Audit trail
		// ---------------------------------------------------------------------

		/**
		 * `defaultNow()` puts the clock in the database, not the application.
		 * Two Workers in different edge locations disagree about the time;
		 * Postgres does not.
		 *
		 * `withTimezone: true` on every timestamp. Postgres `timestamptz`
		 * stores an absolute instant; plain `timestamp` stores wall-clock text
		 * with no zone, which silently means something different depending on
		 * who reads it. There is no good reason to use the latter.
		 */
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},

	// -------------------------------------------------------------------------
	// Table-level constraints and indexes.
	//
	// This second argument is a callback receiving the columns defined above,
	// returning an array of things that apply to the table as a whole rather
	// than to one column.
	// -------------------------------------------------------------------------
	(table) => [
		/**
		 * Email must be unique among people who have one — but many people
		 * legitimately have none (children), and erased rows have none either.
		 *
		 * A plain `.unique()` would treat every NULL as distinct in Postgres,
		 * which happens to work, but would also collide two people who share a
		 * family email address. A partial unique index states the real rule:
		 * unique among live, non-erased rows that actually have an email.
		 */
		uniqueIndex("person_email_unique")
			.on(table.email)
			.where(sql`${table.email} IS NOT NULL AND ${table.deletedAt} IS NULL`),

		/**
		 * Rosters are always filtered to live people, so the index should be
		 * too — it stays smaller and the query planner can use it directly.
		 */
		index("person_active_idx")
			.on(table.fullName)
			.where(sql`${table.deletedAt} IS NULL`),

		index("person_merged_into_idx").on(table.mergedIntoId),

		/**
		 * The rule that `fullName` being nullable would otherwise lose: a person
		 * has a name unless they have been erased.
		 *
		 * Without this, a bug that forgets to set a name produces a nameless
		 * person indistinguishable from an erased one. The database should
		 * refuse that rather than trusting every code path to get it right.
		 */
		check(
			"person_name_present_unless_erased",
			sql`(${table.erasedAt} IS NOT NULL) OR (${table.fullName} IS NOT NULL)`,
		),

		/**
		 * A merged row points at a different person, never at itself — that
		 * would be a cycle the read path would follow forever.
		 */
		check(
			"person_merge_not_self",
			sql`${table.mergedIntoId} IS NULL OR ${table.mergedIntoId} <> ${table.id}`,
		),
	],
);

/**
 * Types inferred from the table definition, not written by hand.
 *
 * This is the payoff for defining the schema in TypeScript: `Person` is derived
 * from the columns above, so adding a column updates the type automatically and
 * there is no second definition to keep in sync.
 *
 * `$inferSelect` is the shape that comes *out* of a query — every column
 * present, nullable ones typed `string | null`.
 *
 * `$inferInsert` is the shape that goes *in* — columns with defaults (`id`,
 * `createdAt`) and nullable ones become optional, so TypeScript will not make
 * you supply an id you intend Postgres to generate.
 *
 * `type` rather than `interface` because these are aliases for a computed type,
 * not shapes to be extended.
 */
export type Person = typeof person.$inferSelect;
export type NewPerson = typeof person.$inferInsert;
