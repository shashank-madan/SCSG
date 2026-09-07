/**
 * The `membership` table: a person's time-bounded belonging to a section.
 *
 * This is the table the PRD's crossover rule lives in. A child accumulates
 * several of these over a scouting lifetime — Pack, then Troop, then Crew — and
 * every one of them persists forever.
 *
 * **Never mutate a membership to record a change.** Close it and open a new
 * one. A Cub becoming a Scout gets `leftAt` and `endReason = 'crossover'` on the
 * old row, plus a new row on the Troop, linked by `crossedToMembershipId`.
 *
 * This table has no `deletedAt`, per ADR 0003. A membership that ended is not
 * deleted; it happened.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { person } from "./person.ts";
import { section } from "./section.ts";

/**
 * Why a membership ended. Recorded explicitly rather than inferred, because the
 * distinction matters: a child who crossed over is still in the group, one who
 * moved away is not, and the two should not be counted together.
 */
export const MEMBERSHIP_END_REASONS = [
	"crossover", // moved up to the next section
	"moved", // left the area
	"aged_out", // too old, did not continue
	"left", // stopped attending
] as const;

export type MembershipEndReason = (typeof MEMBERSHIP_END_REASONS)[number];

export const membership = pgTable(
	"membership",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		personId: uuid("person_id")
			.notNull()
			.references(() => person.id),

		sectionId: uuid("section_id")
			.notNull()
			.references(() => section.id),

		/**
		 * When they joined this section. A date, not a timestamp — nobody
		 * records the hour a child joined a Pack, and a timestamp would invite
		 * timezone bugs on a value that is only ever compared by day.
		 */
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		/**
		 * When they left. Null means currently a member — the condition every
		 * roster query filters on.
		 */
		leftAt: timestamp("left_at", { withTimezone: true }),

		endReason: text("end_reason").$type<MembershipEndReason>(),

		/**
		 * For a crossover, the membership that follows this one. Lets a Rover's
		 * whole history be walked forward from their first Pack membership.
		 *
		 * Self-referencing, so it needs the `AnyPgColumn` annotation — the same
		 * circularity as `person.mergedIntoId`. TypeScript cannot infer a type
		 * that refers to the table still being defined.
		 */
		crossedToMembershipId: uuid("crossed_to_membership_id").references(
			(): AnyPgColumn => membership.id,
		),

		/**
		 * Free text — "joined from another group", "returned after a year out".
		 * PII: prose about a person, erased wholesale per ADR 0002.
		 */
		note: text("note"),

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
		 * A person has at most one *open* membership per section. They may have
		 * many closed ones — a child who left the Pack and came back has two,
		 * and both are real.
		 *
		 * The partial predicate is what makes this work: the index only covers
		 * rows where `leftAt IS NULL`, so closed memberships are invisible to it
		 * and never collide.
		 */
		uniqueIndex("membership_one_open_per_section")
			.on(table.personId, table.sectionId)
			.where(sql`${table.leftAt} IS NULL`),

		/**
		 * A closed membership has a reason, and an open one does not. Without
		 * this, a bug that sets `leftAt` without `endReason` produces a
		 * membership that ended for unknown reasons — and the crossover
		 * reporting the group actually cares about quietly loses rows.
		 */
		check(
			"membership_end_reason_iff_left",
			sql`(${table.leftAt} IS NULL AND ${table.endReason} IS NULL)
			 OR (${table.leftAt} IS NOT NULL AND ${table.endReason} IS NOT NULL)`,
		),

		check(
			"membership_end_reason_known",
			sql`${table.endReason} IS NULL OR ${table.endReason} IN ${sql.raw(
				`(${MEMBERSHIP_END_REASONS.map((r) => `'${r}'`).join(", ")})`,
			)}`,
		),

		/** Only a crossover points at a following membership. */
		check(
			"membership_crossover_link_needs_crossover",
			sql`${table.crossedToMembershipId} IS NULL OR ${table.endReason} = 'crossover'`,
		),

		check(
			"membership_not_left_before_joined",
			sql`${table.leftAt} IS NULL OR ${table.leftAt} >= ${table.joinedAt}`,
		),

		/** A membership cannot cross over to itself. */
		check(
			"membership_crossover_not_self",
			sql`${table.crossedToMembershipId} IS DISTINCT FROM ${table.id}`,
		),

		/** "Who is in this section now" — the roster query, on every page. */
		index("membership_section_active_idx")
			.on(table.sectionId)
			.where(sql`${table.leftAt} IS NULL`),

		/** "What is this person's history" — the profile view. */
		index("membership_person_idx").on(table.personId),
	],
);

export type Membership = typeof membership.$inferSelect;
export type NewMembership = typeof membership.$inferInsert;
