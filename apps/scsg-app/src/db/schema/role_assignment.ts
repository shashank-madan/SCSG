/**
 * The `role_assignment` table: scoped, time-bounded grants of authority.
 *
 * This is the table the PRD's §4 architecture rests on. Three rules it exists
 * to enforce:
 *
 * 1. **Role is never a column on a person or a user.** That would lose
 *    multi-role people, history, and crossover simultaneously. Someone can be
 *    a Scout Master and the Treasurer at once; both are rows here.
 * 2. **Every grant is scoped.** "Section leader" is meaningless without saying
 *    which section.
 * 3. **Permissions are computed from active assignments at request time, never
 *    stored as booleans.** Stored permissions drift from reality and become a
 *    security bug.
 *
 * No `deletedAt` (ADR 0003) — an assignment that ended is closed with
 * `validTo`, not deleted. Someone who led the Pack in 2024 really did.
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
 * What a role is granted over. The target id is interpreted against this — a
 * `SECTION`-scoped assignment's `scopeId` is a section id.
 */
export const ROLE_SCOPES = ["GROUP", "SECTION", "SUB_UNIT"] as const;

export type RoleScope = (typeof ROLE_SCOPES)[number];

/**
 * Role types, deliberately abstract.
 *
 * Cub Master, Flock Leader, Scout Master, Guide Captain and Rover Scout Leader
 * have identical permissions over their own section, so there is one role, not
 * five. The display label is derived from `roleType × sectionType` in code —
 * adding Rangers means adding a section type and a label mapping, never a
 * permission branch.
 *
 * Per ADR 0004 these are data, not a hardcoded union in the permission layer.
 * The permission code must look roles up rather than switching on a TypeScript
 * literal, or adding `HELPER` later stops being a row and becomes a rewrite.
 */
export const ROLE_TYPES = [
	// -------------------------------------------------------------------------
	// ADULT authority. These grant access to children's data.
	//
	// "Master" is the adult in charge, following BSG usage: a Scout Master is
	// the adult, a Troop Leader is a Scout. Getting this distinction wrong in a
	// permission check would hand adult authority to a thirteen-year-old, so the
	// naming carries it explicitly rather than relying on convention.
	// -------------------------------------------------------------------------
	"GROUP_LEADER", // the adult in overall charge of the whole group
	"SECTION_MASTER", // Cub Master, Scout Master, Guide Captain — label derived
	"ASSISTANT_SECTION_MASTER",

	// -------------------------------------------------------------------------
	// YOUTH authority. Held by children, over other children, within their own
	// section or sub-unit. Never grants access to personal data.
	// -------------------------------------------------------------------------
	"SECTION_LEADER", // Troop Leader / Company Leader — a youth role
	"SUB_UNIT_LEADER", // "Sixer" in a Pack, "Patrol Leader" in a Troop
	"SUB_UNIT_SECOND", // "Second" in both

	// -------------------------------------------------------------------------
	// Platform responsibility, separate from scouting authority.
	//
	// The PRD proposed Registrar, Treasurer and Data & Safeguarding Officer as
	// well. None ship in v1: they are committee job titles rather than distinct
	// access levels, and a role nobody holds is complexity in every permission
	// check. Role types are data (ADR 0004), so adding one when a real person
	// needs it is a row — and by then it can be shaped around what they
	// actually do.
	// -------------------------------------------------------------------------
	"SUPERADMIN", // break-glass only, logged loudly, used almost never
] as const;

/**
 * The roles held by children rather than adults.
 *
 * `SECTION_LEADER` is a youth role and `SECTION_MASTER` is the adult one — a
 * pair of names one character apart in the middle, guarding a distinction that
 * matters. This set exists so permission code can ask the question directly
 * instead of relying on someone reading the name carefully.
 *
 * Youth roles must never grant access to other children's personal data.
 */
export const YOUTH_ROLE_TYPES = [
	"SECTION_LEADER",
	"SUB_UNIT_LEADER",
	"SUB_UNIT_SECOND",
] as const satisfies readonly RoleType[];

export function isYouthRole(role: RoleType): boolean {
	return (YOUTH_ROLE_TYPES as readonly RoleType[]).includes(role);
}

export type RoleType = (typeof ROLE_TYPES)[number];

/**
 * Which scope each role is granted at. Used by the application to validate an
 * assignment before writing it — the database can only check that the scope is
 * one of the three, not that it is the right one for the role.
 *
 * `GUARDIAN` and `MEMBER` from the PRD's table are deliberately absent: both
 * are derived rather than assigned. Guardianship comes from an active
 * `guardian_link`, and membership from an open `membership` row. Storing them
 * here would create a second source of truth that could disagree.
 */
export const ROLE_SCOPE_FOR_TYPE: Record<RoleType, RoleScope> = {
	// Adult
	GROUP_LEADER: "GROUP",
	SECTION_MASTER: "SECTION",
	ASSISTANT_SECTION_MASTER: "SECTION",

	// Youth
	SECTION_LEADER: "SECTION",
	SUB_UNIT_LEADER: "SUB_UNIT",
	SUB_UNIT_SECOND: "SUB_UNIT",

	// Platform
	SUPERADMIN: "GROUP",
};

export const roleAssignment = pgTable(
	"role_assignment",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		personId: uuid("person_id")
			.notNull()
			.references(() => person.id),

		roleType: text("role_type").$type<RoleType>().notNull(),

		scope: text("scope").$type<RoleScope>().notNull(),

		/**
		 * The section or sub-unit this is granted over. Null for `GROUP` scope,
		 * because the group is implicit — there is only one.
		 *
		 * Deliberately not a foreign key: it points at `section` or `sub_unit`
		 * depending on `scope`, and a column cannot reference two tables. The
		 * application must validate it, and the CHECK below at least enforces
		 * that it is present exactly when the scope requires it.
		 *
		 * This is the one place the schema is weaker than the rest. The
		 * alternative — separate `section_id` and `sub_unit_id` columns — was
		 * rejected because it makes every permission query branch on which
		 * column is set.
		 */
		scopeId: uuid("scope_id"),

		/**
		 * When this grant takes effect. Explicit rather than defaulted: a role
		 * recorded after the fact should carry the date it actually started.
		 */
		validFrom: timestamp("valid_from", { withTimezone: true })
			.notNull()
			.defaultNow(),

		/** Null means currently held. */
		validTo: timestamp("valid_to", { withTimezone: true }),

		/**
		 * Who made this grant.
		 *
		 * A plain UUID rather than a foreign key: this is an audit fact about who
		 * did something, and it must survive that person's own erasure unchanged.
		 * Same reasoning as `consent_record.recordedByPersonId`.
		 *
		 * The PRD's two-person rule — a second recorded approver for any role
		 * granting access to children's data — is deliberately not implemented.
		 * A rule needs enough people to satisfy it, and a volunteer group of this
		 * size does not reliably have two adults available to approve a grant.
		 * The audit log records who granted what; that is the control that
		 * actually holds here.
		 */
		grantedByPersonId: uuid("granted_by_person_id"),

		/**
		 * Why this was granted or revoked. Not PII in the usual sense, but it is
		 * prose about a person and may name others, so it is erased with the
		 * rest (ADR 0002).
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
		 * The same person does not hold the same role over the same thing twice
		 * at once. They may hold it again later — a Scout Master who steps down
		 * and returns has two rows, both real — which the partial predicate
		 * allows by excluding closed assignments.
		 *
		 * Two indexes, split on whether `scopeId` is set, for the same reason as
		 * `consent_record`: NULLs do not compare equal in a unique index, so a
		 * single index over a nullable column would not constrain the GROUP case
		 * at all.
		 */
		uniqueIndex("role_assignment_one_active_group_scope")
			.on(table.personId, table.roleType)
			.where(sql`${table.validTo} IS NULL AND ${table.scopeId} IS NULL`),

		uniqueIndex("role_assignment_one_active_scoped")
			.on(table.personId, table.roleType, table.scopeId)
			.where(sql`${table.validTo} IS NULL AND ${table.scopeId} IS NOT NULL`),

		check(
			"role_assignment_role_type_known",
			sql`${table.roleType} IN ${sql.raw(
				`(${ROLE_TYPES.map((r) => `'${r}'`).join(", ")})`,
			)}`,
		),

		check(
			"role_assignment_scope_known",
			sql`${table.scope} IN ${sql.raw(
				`(${ROLE_SCOPES.map((s) => `'${s}'`).join(", ")})`,
			)}`,
		),

		/**
		 * A scoped role names its target; a group role does not. Without this, a
		 * `SECTION_LEADER` with a null `scopeId` would be a section leader of no
		 * section — and a permission check asking "may they edit section X"
		 * would have to guess.
		 */
		check(
			"role_assignment_scope_id_iff_scoped",
			sql`(${table.scope} = 'GROUP' AND ${table.scopeId} IS NULL)
			 OR (${table.scope} <> 'GROUP' AND ${table.scopeId} IS NOT NULL)`,
		),

		check(
			"role_assignment_not_ended_before_started",
			sql`${table.validTo} IS NULL OR ${table.validTo} >= ${table.validFrom}`,
		),

		/**
		 * The permission-resolution query, run on every authenticated request:
		 * "what roles does this person currently hold?" It must not be a scan.
		 */
		index("role_assignment_person_active_idx")
			.on(table.personId)
			.where(sql`${table.validTo} IS NULL`),

		/** "Who leads this section?" — for rosters and contact lists. */
		index("role_assignment_scope_active_idx")
			.on(table.scopeId, table.roleType)
			.where(sql`${table.validTo} IS NULL`),
	],
);

export type RoleAssignment = typeof roleAssignment.$inferSelect;
export type NewRoleAssignment = typeof roleAssignment.$inferInsert;
