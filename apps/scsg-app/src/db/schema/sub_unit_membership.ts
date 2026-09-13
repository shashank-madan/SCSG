/**
 * The `sub_unit_membership` table: which Six or Patrol a person is in.
 *
 * Separate from `membership` because the two change at very different rates. A
 * Cub's Pack membership runs for years; their Six can change several times
 * within one of those years. Putting the Six on the membership row would mean
 * either mutating it or falsely closing the Pack membership on every change.
 *
 * See docs/adr/0005-section-subunit-membership.md.
 *
 * No `deletedAt`, same as `membership` — a sub-unit membership that ended is
 * closed with `leftAt`, not deleted.
 */

import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { membership } from "./membership.ts";
import { subUnit } from "./sub_unit.ts";

export const subUnitMembership = pgTable(
	"sub_unit_membership",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		/**
		 * References the *membership*, not the person directly.
		 *
		 * This is the load-bearing choice in this table. Going through the
		 * membership means a Six assignment is automatically tied to the section
		 * membership that contains it — so a Cub's Six history cannot outlive
		 * their Pack membership, and their whole Pack record (Six included)
		 * stays distinguishable from their later Troop record.
		 *
		 * Referencing `person` directly would allow a Six assignment with no
		 * corresponding Pack membership, which is meaningless.
		 */
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => membership.id),

		subUnitId: uuid("sub_unit_id")
			.notNull()
			.references(() => subUnit.id),

		joinedAt: timestamp("joined_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		/** Null means currently in this Six or Patrol. */
		leftAt: timestamp("left_at", { withTimezone: true }),

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
		 * A membership is in at most one sub-unit at a time.
		 *
		 * Note this is keyed on `membershipId` alone, not on the pair — being in
		 * two Sixes simultaneously is wrong regardless of which Sixes they are.
		 * Closed rows are excluded by the partial predicate, so moving between
		 * Sixes over time is fine.
		 */
		uniqueIndex("sub_unit_membership_one_open_per_membership")
			.on(table.membershipId)
			.where(sql`${table.leftAt} IS NULL`),

		check(
			"sub_unit_membership_not_left_before_joined",
			sql`${table.leftAt} IS NULL OR ${table.leftAt} >= ${table.joinedAt}`,
		),

		/** "Who is in this Six now" — the sub-unit roster. */
		index("sub_unit_membership_sub_unit_active_idx")
			.on(table.subUnitId)
			.where(sql`${table.leftAt} IS NULL`),

		index("sub_unit_membership_membership_idx").on(table.membershipId),
	],
);

export type SubUnitMembership = typeof subUnitMembership.$inferSelect;
export type NewSubUnitMembership = typeof subUnitMembership.$inferInsert;
