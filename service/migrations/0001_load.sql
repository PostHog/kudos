CREATE TABLE "loadCheckpoints" (
	"entry" text PRIMARY KEY NOT NULL,
	"lines" integer NOT NULL,
	"done" boolean NOT NULL,
	"reports" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loadChunks" (
	"number" integer PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loadState" (
	"key" text PRIMARY KEY NOT NULL,
	"phase" text NOT NULL,
	"tokenHash" text NOT NULL,
	"chunks" integer,
	"sha256" text,
	"error" text
);
