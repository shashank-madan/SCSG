/**
 * The `sub_unit` table: the small groups a section is divided into.
 *
 * A Pack is divided into Sixes, a Troop into Patrols. These are the same shape
 * whatever they are called — the label comes from the parent section's type
 * (see `SUB_UNIT_LABELS` in section.ts).
 *
 * See docs/adr/0005-section-subunit-membership.md.
 */

import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { section } from "./section.ts";

export const subUnit = pgTable(
	"sub_unit",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		/**
		 * The section this belongs to. Permanent — a Six belongs to its Pack for
		 * as long as both exist, and if the Pack closes its Sixes close with it.
		 *
		 * Nothing in the database stops this being updated; ADR 0005 records the
		 * intent, and the application should not offer a way to move one.
		 */
		sectionId: uuid("section_id")
			.notNull()
			.references(() => section.id),

		/**
		 * What this Six or Patrol is called — "Tiger", "Cobra", "Red".
		 * Traditionally an animal or colour, but not constrained: groups name
		 * these however they like.
		 */
		name: text("name").notNull(),

		/**
		 * When this sub-unit stopped running, mirroring `section.closedAt`.
		 * A Six that folded for lack of numbers is closed, not deleted — the
		 * children who were in it were really in it.
		 */
		closedAt: timestamp("closed_at", { withTimezone: true }),

		/** Soft delete for a sub-unit created in error. ADR 0003. */
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
		 * Names are unique within a section, not globally — a Pack and a Troop
		 * may both have a "Tiger". Partial, so a deleted sub-unit does not
		 * permanently reserve its name.
		 */
		uniqueIndex("sub_unit_name_unique_per_section")
			.on(table.sectionId, table.name)
			.where(sql`${table.deletedAt} IS NULL`),

		/** "Show me this section's Sixes" — the query this table exists for. */
		index("sub_unit_section_idx")
			.on(table.sectionId)
			.where(sql`${table.deletedAt} IS NULL`),
	],
);

export type SubUnit = typeof subUnit.$inferSelect;
export type NewSubUnit = typeof subUnit.$inferInsert;
