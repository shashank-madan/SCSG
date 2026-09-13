/**
 * The `consent_record` table: what each guardian has agreed to, for which child.
 *
 * This is the lawful basis on which the app holds a child's data at all. DPDPA
 * requires verifiable parental consent, and "verifiable" is why this is a table
 * rather than an assumption — a paper form in a folder is not retrievable a year
 * later when a parent asks what they agreed to.
 *
 * **A missing row means no consent.** Never read absence as "probably fine".
 *
 * See docs/adr/0006-consent-records.md.
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
import { guardianLink } from "./guardian_link.ts";

/**
 * What consent is being given *for*. Separate purposes because these are not
 * the same ask, and bundling them makes the consent weaker under DPDPA as well
 * as less useful in practice.
 *
 * Adding a purpose is a row here plus a migration for the CHECK — and nobody
 * has consented to it until they say so, which is the correct default.
 */
export const CONSENT_PURPOSES = [
	/**
	 * Name, DOB, contact, attendance, badge progress. The baseline: refusing
	 * means the child cannot be a member, because there is no lawful basis for
	 * holding the records membership requires.
	 */
	"membership_records",

	/** A child's photo in announcements and messages to other families. */
	"photos_internal",

	/**
	 * A child's photo on the website, social media or in the press. The one
	 * parents most often refuse, and the one with the highest cost if it is
	 * got wrong.
	 */
	"photos_public",

	/** Whether a guardian's phone number appears on a section contact list. */
	"contact_visible_to_families",

	/**
	 * Attending a specific camp or event. Distinguished from the standing
	 * purposes above by `eventId` being set.
	 */
	"event_participation",
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * How consent was obtained. DPDPA requires consent to be verifiable, which
 * means recording *how* it was given, not only that it was.
 */
export const CONSENT_METHODS = [
	"in_person", // a leader witnessed it
	"signed_form", // paper, scanned or filed
	"digital", // the guardian clicked through in this app
	"email", // written confirmation from the guardian
	"whatsapp", // message from the guardian's known number
] as const;

export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const consentRecord = pgTable(
	"consent_record",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		/**
		 * References the guardian link rather than the guardian and child
		 * separately.
		 *
		 * Consent is a property of the relationship: it is *this adult, for this
		 * child*. Going through the link means a consent record cannot exist for
		 * a pair who are not actually linked, and a child with two guardians can
		 * have consent from one and not the other — which happens, and which two
		 * loose columns would not capture cleanly.
		 */
		guardianLinkId: uuid("guardian_link_id")
			.notNull()
			.references(() => guardianLink.id),

		purpose: text("purpose").$type<ConsentPurpose>().notNull(),

		/**
		 * The event this consent is for, when the purpose is
		 * `event_participation`. Null for standing consent.
		 *
		 * Deliberately without a foreign key: there is no `event` table yet, and
		 * inventing one to satisfy a constraint would mean designing the events
		 * module before it is needed. The FK is added when that table exists.
		 *
		 * Event-specific detail — medical information, dietary needs, emergency
		 * contacts, pickup arrangements — must NOT accumulate here. That belongs
		 * to the event module. This table records that consent was given, by
		 * whom, when, and how.
		 */
		eventId: uuid("event_id"),

		/**
		 * When consent was given. Not defaulted — a row should not come into
		 * existence already consenting. Creating the record *is* the act of
		 * recording consent, so the caller states when it happened, which may be
		 * earlier than now for a form signed last week.
		 */
		givenAt: timestamp("given_at", { withTimezone: true }).notNull(),

		method: text("method").$type<ConsentMethod>().notNull(),

		/**
		 * When consent was withdrawn. Set rather than deleting the row: DPDPA
		 * requires withdrawal to be as easy as giving, and the fact that a family
		 * consented and later changed their mind is itself part of the record.
		 *
		 * Active consent is `withdrawnAt IS NULL`, never merely the existence of
		 * a row.
		 */
		withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),

		/**
		 * Who recorded this — the leader who witnessed the signature, or null
		 * when the guardian gave it themselves through the app.
		 *
		 * Not a foreign key to `person` deliberately: this is an audit fact about
		 * who did something, and it should survive that person's own erasure
		 * unchanged. A UUID with no constraint records it without creating a
		 * dependency that erasure would have to resolve.
		 */
		recordedByPersonId: uuid("recorded_by_person_id"),

		/**
		 * Reference to the evidence — an R2 object key for a scanned form, or a
		 * message id. Not PII in itself, but what it points at may be, so
		 * erasure must follow it.
		 */
		evidenceKey: text("evidence_key"),

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
		 * One active consent per link per purpose — and per event, where there is
		 * one.
		 *
		 * Partial on `withdrawnAt IS NULL`, so the history of giving, withdrawing
		 * and giving again is all keepable while only one is ever current.
		 *
		 * Two indexes rather than one, because NULLs do not compare equal in a
		 * unique index. A single index over `(link, purpose, eventId)` would let
		 * two standing consents for the same purpose both exist, their NULL event
		 * ids counting as distinct. Splitting on whether `eventId` is set gives
		 * each case an index that actually constrains it.
		 */
		uniqueIndex("consent_record_one_active_per_purpose")
			.on(table.guardianLinkId, table.purpose)
			.where(sql`${table.withdrawnAt} IS NULL AND ${table.eventId} IS NULL`),

		uniqueIndex("consent_record_one_active_per_event")
			.on(table.guardianLinkId, table.purpose, table.eventId)
			.where(
				sql`${table.withdrawnAt} IS NULL AND ${table.eventId} IS NOT NULL`,
			),

		check(
			"consent_record_purpose_known",
			sql`${table.purpose} IN ${sql.raw(
				`(${CONSENT_PURPOSES.map((p) => `'${p}'`).join(", ")})`,
			)}`,
		),

		check(
			"consent_record_method_known",
			sql`${table.method} IN ${sql.raw(
				`(${CONSENT_METHODS.map((m) => `'${m}'`).join(", ")})`,
			)}`,
		),

		/**
		 * An event consent has an event; a standing consent does not. Without
		 * this, an `event_participation` row with a null event would be consent
		 * for no particular camp, which means nothing.
		 */
		check(
			"consent_record_event_iff_event_purpose",
			sql`(${table.purpose} = 'event_participation' AND ${table.eventId} IS NOT NULL)
			 OR (${table.purpose} <> 'event_participation' AND ${table.eventId} IS NULL)`,
		),

		check(
			"consent_record_not_withdrawn_before_given",
			sql`${table.withdrawnAt} IS NULL OR ${table.withdrawnAt} >= ${table.givenAt}`,
		),

		/**
		 * "Does this child have consent for X" — checked on every page that shows
		 * a photo or a contact detail, so it must not be a scan.
		 */
		index("consent_record_link_purpose_idx").on(
			table.guardianLinkId,
			table.purpose,
		),

		/** "Who has not yet consented for this camp" — the chasing query. */
		index("consent_record_event_idx")
			.on(table.eventId)
			.where(sql`${table.eventId} IS NOT NULL`),
	],
);

export type ConsentRecord = typeof consentRecord.$inferSelect;
export type NewConsentRecord = typeof consentRecord.$inferInsert;
