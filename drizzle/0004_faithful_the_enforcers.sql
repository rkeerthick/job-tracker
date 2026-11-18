ALTER TABLE "applications" ADD COLUMN "location" varchar(255);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "salary_text" varchar(255);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "skills" text[];--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "interview_at" timestamp with time zone;