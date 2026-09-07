/**
 * The `guardian_link` table: which adults are responsible for which children.
 *
 * Consent hangs off this table rather than living on it: `consent_record` has
 * one row per purpose per link, because consent is a property of the
 * guardian–child relationship — a child with two guardians may have consent
 * from one and not the other.
 *
 * See docs/adr/0006-consent-records.md and
 * docs/adr/0002-deletion-erasure-and-audit.md for the erasure rules.
 */

import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { person } from "./person.ts";

/**
 * Relationship values, kept as an ordinary array rather than a Postgres enum.
 *
 * Postgres enums are painful to change: adding a value needs a migration, and
 * removing or reordering one is worse. The same reasoning as ADR 0004 on role
 * types applies — real families do not fit a list decided in advance, and the
 * cost of being wrong should be a row, not a migration.
 *
 * Deliberately ungendered. "Mother" and "father" would encode the guardian's
 * gender into every link — information that belongs on the guardian's own
 * `person` row if it is needed at all, and that forces a wrong answer on
 * families the pair does not describe. What this column is actually for is the
 * authority an adult holds over a child, and `parent` says that exactly.
 *
 * Relations without custody are not guardians and get no row here. An adult
 * sibling or aunt who does have custody is a `legal_guardian`.
 *
 * `as const` is what makes this useful to TypeScript. Without it the array is
 * inferred as `string[]`; with it, the literal values survive, so
 * `GuardianRelationship` becomes the union
 * `"parent" | "grandparent" | "legal_guardian" | "other"` rather than `string`.
 */
export const GUARDIAN_RELATIONSHIPS = [
	"parent",
	"grandparent",
	"legal_guardian",
	"other",
] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export const guardianLink = pgTable(
	"guardian_link",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// ---------------------------------------------------------------------
		// The two people. Both reference `person`, because a guardian is a
		// person too — with their own contact details and possibly their own
		// login. Never copy a guardian's details onto a child's row (ADR 0002).
		// ---------------------------------------------------------------------

		/**
		 * The adult. `.references()` makes this a real foreign key, so Postgres
		 * rejects a link to a person who does not exist.
		 *
		 * The arrow function defers the lookup — at the moment this line is
		 * evaluated, the imported `person` may not be fully initialised. Unlike
		 * `person.mergedIntoId` this needs no `AnyPgColumn` annotation, because
		 * a different table is a type TypeScript can already work out.
		 */
		guardianId: uuid("guardian_id")
			.notNull()
			.references(() => person.id),

		/**
		 * The child. Named `childId` rather than `studentId` — this is a scout
		 * group, and its members are Cubs, Scouts and Guides, never students.
		 * Domain language in the schema keeps queries readable years later.
		 */
		childId: uuid("child_id")
			.notNull()
			.references(() => person.id),

		// ---------------------------------------------------------------------
		// PII — nulled on erasure of either person. See ADR 0002.
		// ---------------------------------------------------------------------

		/**
		 * One of GUARDIAN_RELATIONSHIPS, enforced by the CHECK below rather than
		 * by a Postgres enum type.
		 *
		 * Nullable, because erasure clears it: the structural fact that a link
		 * existed survives, but the human detail does not. A row with a null
		 * relationship means "these two were linked, and one of them has since
		 * been erased".
		 */
		relationship: text("relationship").$type<GuardianRelationship>(),

		/**
		 * Free text context on the link — "father's elder brother, has custody",
		 * "shares custody alternate weeks". Most useful alongside `other`, but
		 * not tied to it: a note that only made sense for one value would be
		 * orphaned the moment someone corrected `other` to `legal_guardian`.
		 *
		 * PII, and erased wholesale. Personal data hides in prose and cannot be
		 * removed selectively — the same rule as `person.notes` (ADR 0002).
		 */
		note: text("note"),

		// ---------------------------------------------------------------------
		// Lifecycle
		//
		// Consent is deliberately NOT here. It lives in `consent_record`, one
		// row per purpose, because "yes to attendance records" and "yes to
		// photos on the website" are different questions and a single flag
		// cannot hold both. See ADR 0006.
		// ---------------------------------------------------------------------

		/**
		 * When this guardianship ended — a child turns 18, a court order
		 * changes custody, a carer stops being responsible.
		 *
		 * This table has no `deletedAt` (ADR 0003). A guardianship that ended
		 * is not deleted; it happened, and any consent given under it stays part
		 * of the record. Closing it follows the same rule as `membership`.
		 */
		endedAt: timestamp("ended_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},

	(table) => [
		/**
		 * A person cannot be their own guardian.
		 *
		 * `IS DISTINCT FROM` rather than `<>` — a plain `<>` evaluates to NULL
		 * if either side is NULL, and a CHECK passes on NULL, so the constraint
		 * would silently not apply. Both columns are `.notNull()` here so it
		 * cannot arise, but the habit is worth keeping: `IS DISTINCT FROM`
		 * treats NULL as an ordinary value and always returns true or false.
		 */
		check(
			"guardian_link_not_self",
			sql`${table.guardianId} IS DISTINCT FROM ${table.childId}`,
		),

		/**
		 * The same pair is linked once — but deliberately *not* including
		 * `relationship` in the key.
		 *
		 * Including it would permit the same two people to be linked twice with
		 * different relationships, which is a data-entry error rather than a
		 * real case. Excluding it costs nothing: two mothers are two different
		 * guardian rows for the same child, which this allows, because the
		 * guardians are different people.
		 */
		uniqueIndex("guardian_link_pair_unique").on(
			table.guardianId,
			table.childId,
		),

		/**
		 * `relationship` must be one of the known values, or null.
		 *
		 * `sql.raw` because the list is interpolated as SQL literals rather than
		 * bound parameters — a CHECK constraint is stored in the schema, so it
		 * cannot carry parameters. The values come from a constant in this file,
		 * never from user input, so there is nothing here to inject.
		 */
		check(
			"guardian_link_relationship_known",
			sql`${table.relationship} IS NULL OR ${table.relationship} IN ${sql.raw(
				`(${GUARDIAN_RELATIONSHIPS.map((r) => `'${r}'`).join(", ")})`,
			)}`,
		),

		/**
		 * The two lookups this table exists to serve: "who are this child's
		 * guardians" (parent dashboard permission checks, on every request) and
		 * "which children is this adult responsible for".
		 */
		index("guardian_link_child_idx").on(table.childId),
		index("guardian_link_guardian_idx").on(table.guardianId),
	],
);

export type GuardianLink = typeof guardianLink.$inferSelect;
export type NewGuardianLink = typeof guardianLink.$inferInsert;
