CREATE TABLE "fixture" ("_id" text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO "fixture" ("_id") VALUES ('only-once');
