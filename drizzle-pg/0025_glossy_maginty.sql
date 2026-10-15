CREATE TABLE "harvested_domain_links" (
	"harvested_domain_id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"backlinks" integer,
	"referring_domains" integer,
	"spam_score" integer,
	"checked_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "harvested_domain_links" ADD CONSTRAINT "harvested_domain_links_harvested_domain_id_harvested_domains_id_fk" FOREIGN KEY ("harvested_domain_id") REFERENCES "public"."harvested_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvested_domain_links" ADD CONSTRAINT "harvested_domain_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "harvested_domain_links_project_id_idx" ON "harvested_domain_links" USING btree ("project_id");