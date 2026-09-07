/**
 * Schema barrel. Drizzle needs every table in one object to resolve relations
 * and to generate migrations, so each table file is re-exported here and this
 * is what `drizzle.config.ts` and `db/index.ts` point at.
 */

export * from "./consent_record.ts";
export * from "./guardian_link.ts";
export * from "./membership.ts";
export * from "./person.ts";
export * from "./role_assignment.ts";
export * from "./section.ts";
export * from "./sub_unit.ts";
export * from "./sub_unit_membership.ts";
