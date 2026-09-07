CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_link_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"event_id" uuid,
	"given_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"recorded_by_person_id" uuid,
	"evidence_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_record_purpose_known" CHECK ("consent_record"."purpose" IN ('membership_records', 'photos_internal', 'photos_public', 'contact_visible_to_families', 'event_participation')),
	CONSTRAINT "consent_record_method_known" CHECK ("consent_record"."method" IN ('in_person', 'signed_form', 'digital', 'email', 'whatsapp')),
	CONSTRAINT "consent_record_event_iff_event_purpose" CHECK (("consent_record"."purpose" = 'event_participation' AND "consent_record"."event_id" IS NOT NULL)
			 OR ("consent_record"."purpose" <> 'event_participation' AND "consent_record"."event_id" IS NULL)),
	CONSTRAINT "consent_record_not_withdrawn_before_given" CHECK ("consent_record"."withdrawn_at" IS NULL OR "consent_record"."withdrawn_at" >= "consent_record"."given_at")
);
--> statement-breakpoint
CREATE TABLE "guardian_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"relationship" text,
	"note" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_link_not_self" CHECK ("guardian_link"."guardian_id" IS DISTINCT FROM "guardian_link"."child_id"),
	CONSTRAINT "guardian_link_relationship_known" CHECK ("guardian_link"."relationship" IS NULL OR "guardian_link"."relationship" IN ('parent', 'grandparent', 'legal_guardian', 'other'))
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"end_reason" text,
	"crossed_to_membership_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_end_reason_iff_left" CHECK (("membership"."left_at" IS NULL AND "membership"."end_reason" IS NULL)
			 OR ("membership"."left_at" IS NOT NULL AND "membership"."end_reason" IS NOT NULL)),
	CONSTRAINT "membership_end_reason_known" CHECK ("membership"."end_reason" IS NULL OR "membership"."end_reason" IN ('crossover', 'moved', 'aged_out', 'left')),
	CONSTRAINT "membership_crossover_link_needs_crossover" CHECK ("membership"."crossed_to_membership_id" IS NULL OR "membership"."end_reason" = 'crossover'),
	CONSTRAINT "membership_not_left_before_joined" CHECK ("membership"."left_at" IS NULL OR "membership"."left_at" >= "membership"."joined_at"),
	CONSTRAINT "membership_crossover_not_self" CHECK ("membership"."crossed_to_membership_id" IS DISTINCT FROM "membership"."id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text,
	"date_of_birth" date,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"photo_key" text,
	"deleted_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_name_present_unless_erased" CHECK (("person"."erased_at" IS NOT NULL) OR ("person"."full_name" IS NOT NULL)),
	CONSTRAINT "person_merge_not_self" CHECK ("person"."merged_into_id" IS NULL OR "person"."merged_into_id" <> "person"."id")
);
--> statement-breakpoint
CREATE TABLE "role_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"role_type" text NOT NULL,
	"scope" text NOT NULL,
	"scope_id" uuid,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"granted_by_person_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignment_role_type_known" CHECK ("role_assignment"."role_type" IN ('GROUP_LEADER', 'SECTION_MASTER', 'ASSISTANT_SECTION_MASTER', 'SECTION_LEADER', 'SUB_UNIT_LEADER', 'SUB_UNIT_SECOND', 'SUPERADMIN')),
	CONSTRAINT "role_assignment_scope_known" CHECK ("role_assignment"."scope" IN ('GROUP', 'SECTION', 'SUB_UNIT')),
	CONSTRAINT "role_assignment_scope_id_iff_scoped" CHECK (("role_assignment"."scope" = 'GROUP' AND "role_assignment"."scope_id" IS NULL)
			 OR ("role_assignment"."scope" <> 'GROUP' AND "role_assignment"."scope_id" IS NOT NULL)),
	CONSTRAINT "role_assignment_not_ended_before_started" CHECK ("role_assignment"."valid_to" IS NULL OR "role_assignment"."valid_to" >= "role_assignment"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"section_type" text NOT NULL,
	"description" text,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_type_known" CHECK ("section"."section_type" IN ('PACK', 'FLOCK', 'TROOP', 'COMPANY', 'CREW', 'TEAM'))
);
--> statement-breakpoint
CREATE TABLE "sub_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"name" text NOT NULL,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_unit_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"sub_unit_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_unit_membership_not_left_before_joined" CHECK ("sub_unit_membership"."left_at" IS NULL OR "sub_unit_membership"."left_at" >= "sub_unit_membership"."joined_at")
);
--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_guardian_link_id_guardian_link_id_fk" FOREIGN KEY ("guardian_link_id") REFERENCES "public"."guardian_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_link" ADD CONSTRAINT "guardian_link_guardian_id_person_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_link" ADD CONSTRAINT "guardian_link_child_id_person_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_crossed_to_membership_id_membership_id_fk" FOREIGN KEY ("crossed_to_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_merged_into_id_person_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_unit" ADD CONSTRAINT "sub_unit_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_unit_membership" ADD CONSTRAINT "sub_unit_membership_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_unit_membership" ADD CONSTRAINT "sub_unit_membership_sub_unit_id_sub_unit_id_fk" FOREIGN KEY ("sub_unit_id") REFERENCES "public"."sub_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_record_one_active_per_purpose" ON "consent_record" USING btree ("guardian_link_id","purpose") WHERE "consent_record"."withdrawn_at" IS NULL AND "consent_record"."event_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_record_one_active_per_event" ON "consent_record" USING btree ("guardian_link_id","purpose","event_id") WHERE "consent_record"."withdrawn_at" IS NULL AND "consent_record"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "consent_record_link_purpose_idx" ON "consent_record" USING btree ("guardian_link_id","purpose");--> statement-breakpoint
CREATE INDEX "consent_record_event_idx" ON "consent_record" USING btree ("event_id") WHERE "consent_record"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_link_pair_unique" ON "guardian_link" USING btree ("guardian_id","child_id");--> statement-breakpoint
CREATE INDEX "guardian_link_child_idx" ON "guardian_link" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "guardian_link_guardian_idx" ON "guardian_link" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_open_per_section" ON "membership" USING btree ("person_id","section_id") WHERE "membership"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "membership_section_active_idx" ON "membership" USING btree ("section_id") WHERE "membership"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "membership_person_idx" ON "membership" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_unique" ON "person" USING btree ("email") WHERE "person"."email" IS NOT NULL AND "person"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "person_active_idx" ON "person" USING btree ("full_name") WHERE "person"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "person_merged_into_idx" ON "person" USING btree ("merged_into_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_one_active_group_scope" ON "role_assignment" USING btree ("person_id","role_type") WHERE "role_assignment"."valid_to" IS NULL AND "role_assignment"."scope_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_one_active_scoped" ON "role_assignment" USING btree ("person_id","role_type","scope_id") WHERE "role_assignment"."valid_to" IS NULL AND "role_assignment"."scope_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "role_assignment_person_active_idx" ON "role_assignment" USING btree ("person_id") WHERE "role_assignment"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "role_assignment_scope_active_idx" ON "role_assignment" USING btree ("scope_id","role_type") WHERE "role_assignment"."valid_to" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "section_type_unique" ON "section" USING btree ("section_type") WHERE "section"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "section_name_unique" ON "section" USING btree ("name") WHERE "section"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "section_active_idx" ON "section" USING btree ("section_type") WHERE "section"."deleted_at" IS NULL AND "section"."closed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sub_unit_name_unique_per_section" ON "sub_unit" USING btree ("section_id","name") WHERE "sub_unit"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sub_unit_section_idx" ON "sub_unit" USING btree ("section_id") WHERE "sub_unit"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sub_unit_membership_one_open_per_membership" ON "sub_unit_membership" USING btree ("membership_id") WHERE "sub_unit_membership"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sub_unit_membership_sub_unit_active_idx" ON "sub_unit_membership" USING btree ("sub_unit_id") WHERE "sub_unit_membership"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sub_unit_membership_membership_idx" ON "sub_unit_membership" USING btree ("membership_id");