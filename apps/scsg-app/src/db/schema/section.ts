/**
 * The `section` table: the units a scout group is divided into.
 *
 * A section holds sub-units (a Pack holds Sixes, a Troop holds Patrols) and
 * people belong to it through `membership`.
 *
 * See docs/adr/0005-section-subunit-membership.md.
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

/**
 * The six Bharat Scouts & Guides section types.
 *
 * Stored as constrained text rather than a Postgres enum, for the same reason
 * as `guardianLink.relationship`: adding a value should be a migration, not an
 * `ALTER TYPE`.
 *
 * These drive the display label for a role — `YOUTH_LEADER` renders as "Sixer"
 * in a Pack and "Patrol Leader" in a Troop. That mapping lives in code, which
 * is why the types need no lookup table of their own.
 */
export const SECTION_TYPES = [
	"PACK", // Cubs
	"FLOCK", // Bulbuls
	"TROOP", // Scouts
	"COMPANY", // Guides
	"CREW", // Rovers
	"TEAM", // Rangers
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * What a sub-unit of each section type is called. A Pack is divided into Sixes,
 * a Troop into Patrols. Used for display only — `sub_unit` rows are the same
 * shape whatever they are called.
 */
export const SUB_UNIT_LABELS: Record<SectionType, string> = {
	PACK: "Six",
	FLOCK: "Six",
	TROOP: "Patrol",
	COMPANY: "Patrol",
	CREW: "Crew",
	TEAM: "Team",
};

export const section = pgTable(
	"section",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		/**
		 * The section's own name — "Pack", or "Pack A" if the group ever runs
		 * two. Kept separate from `sectionType` deliberately.
		 *
		 * ADR 0005 limits the group to one section per type via the unique index
		 * below, but nothing joins on `sectionType`; everything references
		 * `section.id`. Lifting that limit later means dropping one index rather
		 * than rewriting every query.
		 */
		name: text("name").notNull(),

		sectionType: text("section_type").$type<SectionType>().notNull(),

		/**
		 * Free text shown on the section page — meeting times, venue, what to
		 * bring. Not PII: this describes the section, not a person.
		 */
		description: text("description"),

		/**
		 * When this section stopped running. A group that closes its Crew for
		 * lack of Rovers sets this rather than deleting the row, so past
		 * memberships still point at something real.
		 *
		 * Distinct from `deletedAt`: a closed section genuinely existed and its
		 * history matters. A deleted one was a mistake.
		 */
		closedAt: timestamp("closed_at", { withTimezone: true }),

		/**
		 * Soft delete — created in error, not a section that ran and stopped.
		 * `section` is one of the tables ADR 0003 puts this on, because deleting
		 * one is a plausible mistake with a recovery story.
		 */
		deletedAt: timestamp("deleted_at", { withTimezone: true }),

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
		 * One section per type, per ADR 0005 — and partial, so a section deleted
		 * in error does not permanently occupy its type.
		 *
		 * This index is the only thing enforcing the one-per-type rule. Dropping
		 * it is the whole of the work if a second Pack is ever opened.
		 */
		uniqueIndex("section_type_unique")
			.on(table.sectionType)
			.where(sql`${table.deletedAt} IS NULL`),

		uniqueIndex("section_name_unique")
			.on(table.name)
			.where(sql`${table.deletedAt} IS NULL`),

		check(
			"section_type_known",
			sql`${table.sectionType} IN ${sql.raw(
				`(${SECTION_TYPES.map((t) => `'${t}'`).join(", ")})`,
			)}`,
		),

		/** Almost every query wants the sections currently running. */
		index("section_active_idx")
			.on(table.sectionType)
			.where(sql`${table.deletedAt} IS NULL AND ${table.closedAt} IS NULL`),
	],
);

export type Section = typeof section.$inferSelect;
export type NewSection = typeof section.$inferInsert;
