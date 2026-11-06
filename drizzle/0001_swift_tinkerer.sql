CREATE TYPE "public"."application_status" AS ENUM('saved', 'applied', 'interview', 'offer', 'rejected');--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "applied_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "applied_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "applied_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "status" SET DEFAULT 'applied'::"public"."application_status";--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "status" SET DATA TYPE "public"."application_status" USING "status"::"public"."application_status";--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "created_at" SET DEFAULT now();