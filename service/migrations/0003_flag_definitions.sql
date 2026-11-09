CREATE TABLE "flagDefinitions" (
	"key" text PRIMARY KEY NOT NULL,
	"definitions" jsonb NOT NULL,
	"fetchedAt" double precision NOT NULL
);
