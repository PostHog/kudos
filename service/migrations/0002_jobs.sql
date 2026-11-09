CREATE TABLE "crons" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"nextRun" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"args" jsonb NOT NULL,
	"runAt" double precision NOT NULL,
	"kind" text COLLATE "C" NOT NULL,
	"state" text COLLATE "C" NOT NULL,
	"error" text COLLATE "C",
	"completedAt" double precision,
	"deadline" double precision
);
--> statement-breakpoint
CREATE INDEX "jobs_by_state_and_runAt" ON "jobs" USING btree ("state","runAt","_creationTime","_id");