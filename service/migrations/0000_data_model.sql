CREATE TABLE "bookBatches" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"completedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "bookLaunches" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookReplayCursors" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"replay" text COLLATE "C" NOT NULL,
	"cursor" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookReplays" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"batch" text COLLATE "C" NOT NULL,
	"ladder" text COLLATE "C" NOT NULL,
	"tiers" jsonb NOT NULL,
	"countsLadder" boolean NOT NULL,
	"cursor" jsonb,
	"isDone" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countedAwards" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"award" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"ladder" text COLLATE "C" NOT NULL,
	"count" double precision NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earnedTiers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"ladder" text COLLATE "C" NOT NULL,
	"tier" text COLLATE "C" NOT NULL,
	"earnedAt" double precision NOT NULL,
	"award" text COLLATE "C" NOT NULL,
	"catalogueVersion" text COLLATE "C" NOT NULL,
	"rewards" jsonb NOT NULL,
	"batch" text COLLATE "C",
	"hidden" boolean
);
--> statement-breakpoint
CREATE TABLE "ladderCounts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"ladder" text COLLATE "C" NOT NULL,
	"count" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ladderMarks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"ladder" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albumHistory" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"startedAt" double precision NOT NULL,
	"phase" text COLLATE "C" NOT NULL,
	"cursor" text COLLATE "C",
	"hug" text COLLATE "C",
	"hugPeopleAfter" text COLLATE "C",
	"done" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albumStickers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL,
	"from" text COLLATE "C" NOT NULL,
	"pack" text COLLATE "C",
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boardCountedAwards" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"award" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boughtCrates" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"crate" text COLLATE "C" NOT NULL,
	"n" double precision NOT NULL,
	"boughtAt" double precision NOT NULL,
	"openedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "dropTallies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"drops" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drops" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"crate" text COLLATE "C" NOT NULL,
	"hoggie" text COLLATE "C" NOT NULL,
	"rarity" text COLLATE "C" NOT NULL,
	"n" double precision NOT NULL,
	"copy" double precision NOT NULL,
	"catalogueVersion" double precision NOT NULL,
	"at" double precision NOT NULL,
	"crest" jsonb,
	"pack" jsonb
);
--> statement-breakpoint
CREATE TABLE "emojiClasses" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"class" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emojiNameNumbers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"stem" text COLLATE "C" NOT NULL,
	"last" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emojiNames" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"emoji" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C",
	"name" text COLLATE "C" NOT NULL,
	"mappedBy" jsonb
);
--> statement-breakpoint
CREATE TABLE "grantRecords" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"message" jsonb NOT NULL,
	"recipient" text COLLATE "C" NOT NULL,
	"outcome" text COLLATE "C" NOT NULL,
	"message.workspace" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'workspace') WHEN 'string' THEN "message"->>'workspace' END) STORED,
	"message.conversation" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'conversation') WHEN 'string' THEN "message"->>'conversation' END) STORED,
	"message.message" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'message') WHEN 'string' THEN "message"->>'message' END) STORED
);
--> statement-breakpoint
CREATE TABLE "grantsTold" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"message" jsonb NOT NULL,
	"at" double precision,
	"recipients" double precision,
	"message.workspace" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'workspace') WHEN 'string' THEN "message"->>'workspace' END) STORED,
	"message.conversation" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'conversation') WHEN 'string' THEN "message"->>'conversation' END) STORED,
	"message.message" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'message') WHEN 'string' THEN "message"->>'message' END) STORED
);
--> statement-breakpoint
CREATE TABLE "hoggieAvatars" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"hoggie" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hoggieTallies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"hoggie" text COLLATE "C" NOT NULL,
	"count" double precision NOT NULL,
	"firstAt" double precision NOT NULL,
	"firstN" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypeReactions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"owner" text COLLATE "C" NOT NULL,
	"author" text COLLATE "C" NOT NULL,
	"emoji" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypesCollected" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"source" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL,
	"floor" text COLLATE "C",
	"cap" text COLLATE "C",
	"weights" text COLLATE "C",
	"reason" jsonb NOT NULL,
	"earnedAt" double precision NOT NULL,
	"turnedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "kudosEmojiPicks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"emoji" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestoneTiers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"milestone" text COLLATE "C" NOT NULL,
	"tier" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"catalogue" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairTallies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL,
	"firstThankedAt" double precision,
	"kudosGiven" double precision NOT NULL,
	"kudosReceived" double precision NOT NULL,
	"hugsGiven" double precision NOT NULL,
	"hugsReceived" double precision NOT NULL,
	"best" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petHoggies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"hoggie" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "randomEmojiDrops" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"pack" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secondEmojiNames" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"emoji" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seenEmojis" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"emoji" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talliedAwards" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"award" text COLLATE "C" NOT NULL,
	"everyKudos" boolean
);
--> statement-breakpoint
CREATE TABLE "talliedHugs" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"hug" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teamStickers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"workspace" text COLLATE "C",
	"team" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"art" jsonb NOT NULL,
	"emoji" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thoughtfulBoardTallies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"period" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"awards" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thoughtfulGiverCounts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"givers" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thoughtfulPacks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"recipient" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"message" jsonb NOT NULL,
	"holdsSticker" boolean NOT NULL,
	"at" double precision NOT NULL,
	"openedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "thoughtfulTallies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"awards" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trayDrops" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"crate" text COLLATE "C" NOT NULL,
	"putInAt" double precision,
	"crest" jsonb
);
--> statement-breakpoint
CREATE TABLE "trayItems" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"pack" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"putInAt" double precision,
	"kind" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C",
	"hoggie" text COLLATE "C",
	"rarity" text COLLATE "C",
	"isNew" boolean
);
--> statement-breakpoint
CREATE TABLE "weekPeople" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"list" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekTallies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"kudosGiven" double precision NOT NULL,
	"kudosReceived" double precision NOT NULL,
	"thoughtfulGiven" double precision NOT NULL,
	"thoughtfulReceived" double precision NOT NULL,
	"hugsGiven" double precision NOT NULL,
	"hugsReceived" double precision NOT NULL,
	"thanked" jsonb NOT NULL,
	"thankedBy" jsonb NOT NULL,
	"hugged" jsonb NOT NULL,
	"huggedBy" jsonb NOT NULL,
	"kudosOfWeek" jsonb NOT NULL,
	"days" jsonb NOT NULL,
	"packsOpened" double precision,
	"newFaces" jsonb,
	"hoggiesFound" jsonb
);
--> statement-breakpoint
CREATE TABLE "analyticsDrain" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"job" text COLLATE "C" NOT NULL,
	"generation" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyticsIds" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"analyticsId" text COLLATE "C" NOT NULL,
	"profileFingerprint" jsonb,
	"profileUncertain" boolean
);
--> statement-breakpoint
CREATE TABLE "analyticsOutbox" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"uuid" text COLLATE "C" NOT NULL,
	"event" text COLLATE "C" NOT NULL,
	"distinctId" text COLLATE "C" NOT NULL,
	"timestamp" double precision NOT NULL,
	"properties" jsonb NOT NULL,
	"exception" jsonb,
	"person" jsonb,
	"state" text COLLATE "C" NOT NULL,
	"failures" double precision NOT NULL,
	"dueAt" double precision NOT NULL,
	"lease" text COLLATE "C",
	"reason" text COLLATE "C"
);
--> statement-breakpoint
CREATE TABLE "errorSweep" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"cursor" double precision NOT NULL,
	"watchCursor" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flagExposures" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"flag" text COLLATE "C" NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordedFacts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"fact" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reportedJobs" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"job" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchedJobs" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"job" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaceKeys" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"workspaceKey" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"job" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companyFaces" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"face" jsonb NOT NULL,
	"profile" double precision
);
--> statement-breakpoint
CREATE TABLE "companyProfileLinks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"profile" double precision,
	"by" text COLLATE "C" NOT NULL,
	"setBy" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companyProfiles" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"firstName" text COLLATE "C" NOT NULL,
	"lastName" text COLLATE "C" NOT NULL,
	"normalisedName" text COLLATE "C" NOT NULL,
	"image" text COLLATE "C",
	"colour" text COLLATE "C" NOT NULL,
	"team" text COLLATE "C",
	"profile" double precision,
	"teams" jsonb,
	"role" text COLLATE "C",
	"asOf" double precision
);
--> statement-breakpoint
CREATE TABLE "companyTeams" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"team" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"crestImage" text COLLATE "C",
	"leads" jsonb NOT NULL,
	"people" jsonb NOT NULL,
	"asOf" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allowanceSpending" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"spent" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"recipient" text COLLATE "C" NOT NULL,
	"kudos" double precision NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kudosMessages" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"threadRoot" text COLLATE "C",
	"author" text COLLATE "C" NOT NULL,
	"revision" bigint NOT NULL,
	"state" text COLLATE "C" NOT NULL,
	"attempt" bigint NOT NULL,
	"retry" boolean,
	"content" jsonb NOT NULL,
	"annotations" jsonb NOT NULL,
	"spendsAt" double precision NOT NULL,
	"checks" double precision NOT NULL,
	"nextCheckAt" double precision
);
--> statement-breakpoint
CREATE TABLE "kudosTexts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"kind" text COLLATE "C" NOT NULL,
	"revision" bigint,
	"author" text COLLATE "C",
	"edited" boolean,
	"segments" jsonb,
	"visibility" text COLLATE "C",
	"gate" jsonb,
	"why" text COLLATE "C"
);
--> statement-breakpoint
CREATE TABLE "kudosTotals" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"given" double precision NOT NULL,
	"received" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotlightDraws" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"position" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wordDeletionRequests" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"author" text COLLATE "C"
);
--> statement-breakpoint
CREATE TABLE "celebratedLevels" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"level" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grantReplies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"message" jsonb NOT NULL,
	"told" text COLLATE "C" NOT NULL,
	"message.workspace" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'workspace') WHEN 'string' THEN "message"->>'workspace' END) STORED,
	"message.conversation" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'conversation') WHEN 'string' THEN "message"->>'conversation' END) STORED,
	"message.message" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("message"->'message') WHEN 'string' THEN "message"->>'message' END) STORED
);
--> statement-breakpoint
CREATE TABLE "homeSelections" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"tab" text COLLATE "C" NOT NULL,
	"period" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homes" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"tab" text COLLATE "C" NOT NULL,
	"version" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicators" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"emoji" text COLLATE "C",
	"version" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oneReplies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"reply" text COLLATE "C" NOT NULL,
	"left" text COLLATE "C" NOT NULL,
	"awaitsQuests" boolean,
	"awaitsItems" boolean,
	"items" jsonb,
	"questsMoved" jsonb
);
--> statement-breakpoint
CREATE TABLE "privateReplies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"threadRoot" text COLLATE "C",
	"to" text COLLATE "C" NOT NULL,
	"given" jsonb,
	"lines" jsonb NOT NULL,
	"questsDone" jsonb,
	"hint" jsonb,
	"gains" jsonb,
	"held" boolean
);
--> statement-breakpoint
CREATE TABLE "publicReplies" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"channel" text COLLATE "C" NOT NULL,
	"sections" jsonb NOT NULL,
	"version" double precision NOT NULL,
	"shown" jsonb NOT NULL,
	"conversation" text COLLATE "C",
	"message" text COLLATE "C",
	"threadTs" text COLLATE "C",
	"reached" jsonb,
	"summary" text COLLATE "C",
	"reached.member" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("reached"->'member') WHEN 'string' THEN "reached"->>'member' END) STORED,
	"reached.level" double precision GENERATED ALWAYS AS (CASE jsonb_typeof("reached"->'level') WHEN 'number' THEN ("reached"->>'level')::double precision END) STORED
);
--> statement-breakpoint
CREATE TABLE "sentNotices" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"notice" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thankYouNudges" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tierNotices" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"tiers" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tierSummaries" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"tiers" jsonb NOT NULL,
	"batch" text COLLATE "C"
);
--> statement-breakpoint
CREATE TABLE "welcomeNudges" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attributions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C",
	"kudos" double precision NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"awards" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groupCountingChanges" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"counts" boolean NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groupSettings" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"mode" text COLLATE "C" NOT NULL,
	"allowlist" jsonb
);
--> statement-breakpoint
CREATE TABLE "memberGroups" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"groups" jsonb NOT NULL,
	"primary" text COLLATE "C",
	"directoryChangedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "primaryGroupHistory" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"from" text COLLATE "C",
	"group" text COLLATE "C",
	"cause" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userGroupDepartures" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"user" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"joinedAt" double precision NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hugCounts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"hugs" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hugPeople" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"hug" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hugWeekMessages" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"hugs" double precision NOT NULL,
	"lastAt" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hugWeeks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"given" double precision NOT NULL,
	"givenXp" double precision NOT NULL,
	"received" double precision NOT NULL,
	"receivedXp" double precision NOT NULL,
	"mostHugged" jsonb
);
--> statement-breakpoint
CREATE TABLE "hugs" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"onKudos" boolean NOT NULL,
	"author" text COLLATE "C",
	"emoji" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"day" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hugsReceived" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"onKudos" boolean NOT NULL,
	"hugs" double precision NOT NULL,
	"emoji" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"givers" jsonb NOT NULL,
	"supersededAt" double precision
);
--> statement-breakpoint
CREATE TABLE "attributedGroupTotals" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"period" text COLLATE "C" NOT NULL,
	"kudos" double precision NOT NULL,
	"runningTotal" jsonb
);
--> statement-breakpoint
CREATE TABLE "attributedTotals" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"period" text COLLATE "C" NOT NULL,
	"kudos" double precision NOT NULL,
	"runningTotal" jsonb
);
--> statement-breakpoint
CREATE TABLE "countedAttributions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countedKudosGiven" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countedRecognitions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featuredNewGivers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"place" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "givenByDay" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"kudos" double precision NOT NULL,
	"kudosReceived" double precision,
	"hugsGiven" double precision,
	"hugsReceived" double precision
);
--> statement-breakpoint
CREATE TABLE "givenTotals" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"period" text COLLATE "C" NOT NULL,
	"kudos" double precision NOT NULL,
	"kudosReceived" double precision,
	"hugsGiven" double precision,
	"hugsReceived" double precision,
	"firstDay" text COLLATE "C",
	"runningTotal" jsonb
);
--> statement-breakpoint
CREATE TABLE "hugRunningTotals" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"period" text COLLATE "C" NOT NULL,
	"runningTotal" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboardSettings" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"visible" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mondayPostClaims" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"claimedAt" double precision NOT NULL,
	"channel" text COLLATE "C" NOT NULL,
	"outcome" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mondayPostSettings" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"on" boolean NOT NULL,
	"timeZone" text COLLATE "C" NOT NULL,
	"generation" double precision NOT NULL,
	"nextPostAt" double precision,
	"channel" jsonb,
	"channelCheck" jsonb
);
--> statement-breakpoint
CREATE TABLE "weekThankers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messageSettings" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"kind" text COLLATE "C" NOT NULL,
	"on" boolean NOT NULL,
	"place" text COLLATE "C"
);
--> statement-breakpoint
CREATE TABLE "progressSettings" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"dms" boolean,
	"muteNotices" boolean
);
--> statement-breakpoint
CREATE TABLE "mondayDmNudges" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"dm" text COLLATE "C" NOT NULL,
	"line" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mondayDms" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"monday" text COLLATE "C" NOT NULL,
	"state" text COLLATE "C" NOT NULL,
	"dueAt" double precision NOT NULL,
	"tries" double precision NOT NULL,
	"sections" jsonb,
	"content" jsonb
);
--> statement-breakpoint
CREATE TABLE "effectsBackfill" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"before" double precision NOT NULL,
	"cursor" text COLLATE "C",
	"isDone" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "effectsRecords" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"award" text COLLATE "C" NOT NULL,
	"side" text COLLATE "C" NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"baseXp" double precision NOT NULL,
	"gate" jsonb NOT NULL,
	"catalogueVersion" text COLLATE "C" NOT NULL,
	"bonus" jsonb,
	"coins" jsonb
);
--> statement-breakpoint
CREATE TABLE "memberProgress" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"xp" double precision NOT NULL,
	"pointsSpent" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perkPurchases" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL,
	"outcome" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perksOwned" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"perk" text COLLATE "C" NOT NULL,
	"boughtAt" double precision NOT NULL,
	"catalogueVersion" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivingGivers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"recipient" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewardRecords" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL,
	"xp" double precision NOT NULL,
	"coins" double precision NOT NULL,
	"item" text COLLATE "C",
	"catalogueVersion" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"cause" jsonb,
	"held" boolean,
	"cause.workspace" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("cause"->'workspace') WHEN 'string' THEN "cause"->>'workspace' END) STORED,
	"cause.conversation" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("cause"->'conversation') WHEN 'string' THEN "cause"->>'conversation' END) STORED,
	"cause.message" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("cause"->'message') WHEN 'string' THEN "cause"->>'message' END) STORED
);
--> statement-breakpoint
CREATE TABLE "hugLadders" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questDraws" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"drawnAt" double precision NOT NULL,
	"slots" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questFinishes" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL,
	"xp" double precision NOT NULL,
	"catalogueVersion" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"cause" jsonb
);
--> statement-breakpoint
CREATE TABLE "questProgress" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"slot" double precision NOT NULL,
	"quest" text COLLATE "C" NOT NULL,
	"award" text COLLATE "C" NOT NULL,
	"recipient" text COLLATE "C" NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questRecognitions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"source" text COLLATE "C" NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"giver" text COLLATE "C" NOT NULL,
	"people" jsonb NOT NULL,
	"kudos" double precision NOT NULL,
	"message" jsonb NOT NULL,
	"day" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questSideDraws" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"week" text COLLATE "C" NOT NULL,
	"side" text COLLATE "C" NOT NULL,
	"quest" text COLLATE "C" NOT NULL,
	"reward" jsonb NOT NULL,
	"catalogueVersion" text COLLATE "C" NOT NULL,
	"feasibleBecause" jsonb NOT NULL,
	"drawnAt" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questStarts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questsJudged" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"award" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardPictures" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"key" text COLLATE "C" NOT NULL,
	"picture" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firstSignIns" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"user" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberVerifications" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"user" text COLLATE "C" NOT NULL,
	"attempts" double precision NOT NULL,
	"state" text COLLATE "C" NOT NULL,
	"nextTryAt" double precision
);
--> statement-breakpoint
CREATE TABLE "placedReactions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"conversation" text COLLATE "C" NOT NULL,
	"message" text COLLATE "C" NOT NULL,
	"emoji" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slackRateLimits" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"method" text COLLATE "C" NOT NULL,
	"until" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slackReceipts" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"eventId" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stickerBackfills" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"cursor" text COLLATE "C",
	"isDone" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stickers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"person" text COLLATE "C" NOT NULL,
	"firstAward" text COLLATE "C" NOT NULL,
	"firstAt" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teamPageChecks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"finished" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teamPageCompletions" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"team" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"crestImage" text COLLATE "C",
	"award" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"people" double precision NOT NULL,
	"told" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"item" text COLLATE "C" NOT NULL,
	"source" text COLLATE "C" NOT NULL,
	"arrivedAt" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customKudosEmoji" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"url" text COLLATE "C" NOT NULL,
	"pickedAt" double precision NOT NULL,
	"unpickedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "itemPurchases" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"key" text COLLATE "C" NOT NULL,
	"outcome" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levelUps" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"level" double precision NOT NULL,
	"ready" jsonb NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "previewMoments" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"moment" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unlockLaunches" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL,
	"shipped" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"feature" text COLLATE "C" NOT NULL,
	"readyAt" double precision NOT NULL,
	"openedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "coinSpends" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"coins" double precision NOT NULL,
	"for" jsonb NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"balance" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "howItWorksCloses" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"triedSlack" boolean NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lastVisits" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"at" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"name" text COLLATE "C",
	"givenName" text COLLATE "C",
	"familyName" text COLLATE "C",
	"image" text COLLATE "C",
	"chatIdentity" jsonb,
	"chatIdentity.workspace" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("chatIdentity"->'workspace') WHEN 'string' THEN "chatIdentity"->>'workspace' END) STORED,
	"chatIdentity.user" text COLLATE "C" GENERATED ALWAYS AS (CASE jsonb_typeof("chatIdentity"->'user') WHEN 'string' THEN "chatIdentity"->>'user' END) STORED
);
--> statement-breakpoint
CREATE TABLE "websiteClock" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"tick" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welcomes" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"member" text COLLATE "C" NOT NULL,
	"welcomed" jsonb,
	"path" text COLLATE "C"
);
--> statement-breakpoint
CREATE TABLE "celebrationsSwitches" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"on" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customEmoji" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"image" text COLLATE "C" NOT NULL,
	"aliasOf" text COLLATE "C",
	"listing" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customEmojiListings" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"begun" double precision NOT NULL,
	"written" double precision,
	"refreshDueAt" double precision,
	"scopeMissing" boolean
);
--> statement-breakpoint
CREATE TABLE "listedMembers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"user" text COLLATE "C" NOT NULL,
	"entry" jsonb NOT NULL,
	"asOf" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"user" text COLLATE "C" NOT NULL,
	"kind" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C",
	"timeZone" text COLLATE "C",
	"admin" boolean,
	"email" text COLLATE "C",
	"realName" text COLLATE "C",
	"displayName" text COLLATE "C",
	"title" text COLLATE "C",
	"picture" text COLLATE "C",
	"asOf" double precision,
	"profileAsOf" double precision
);
--> statement-breakpoint
CREATE TABLE "userGroupMembers" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"user" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userGroups" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"group" text COLLATE "C" NOT NULL,
	"handle" text COLLATE "C" NOT NULL,
	"name" text COLLATE "C" NOT NULL,
	"enabled" boolean NOT NULL,
	"automatic" boolean NOT NULL,
	"members" double precision,
	"membersCountAsOf" double precision,
	"asOf" double precision NOT NULL,
	"membersAsOf" double precision,
	"changedAt" double precision,
	"allowlistChangedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "welcomeNudgeSwitches" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"on" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"workspace" text COLLATE "C" NOT NULL,
	"baseAllowance" double precision,
	"kudosEmoji" text COLLATE "C",
	"announcementChannel" text COLLATE "C",
	"hugBudget" double precision,
	"url" text COLLATE "C",
	"urlRequestedAt" double precision
);
--> statement-breakpoint
CREATE TABLE "archive" (
	"source" text COLLATE "C" NOT NULL,
	"table" text COLLATE "C" NOT NULL,
	"_id" text COLLATE "C" NOT NULL,
	"_creationTime" double precision NOT NULL,
	"document" jsonb NOT NULL,
	CONSTRAINT "archive_source_table__id_pk" PRIMARY KEY("source","table","_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"_id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"sha256" text COLLATE "C" NOT NULL,
	"size" double precision NOT NULL,
	"contentType" text COLLATE "C",
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bookBatches_by_workspace" ON "bookBatches" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "bookLaunches_by_workspace" ON "bookLaunches" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "bookReplayCursors_by_replay" ON "bookReplayCursors" USING btree ("replay","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "bookReplays_by_workspace_ladder" ON "bookReplays" USING btree ("workspace","ladder","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "bookReplays_by_batch" ON "bookReplays" USING btree ("batch","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "countedAwards_by_award_member_ladder" ON "countedAwards" USING btree ("award","member","ladder","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "countedAwards_by_member_ladder_count" ON "countedAwards" USING btree ("member","ladder","count","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "earnedTiers_by_member_ladder_tier" ON "earnedTiers" USING btree ("member","ladder","tier","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "ladderCounts_by_member_ladder" ON "ladderCounts" USING btree ("member","ladder","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "ladderMarks_by_member_ladder_group" ON "ladderMarks" USING btree ("member","ladder","group","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "albumHistory_by_workspace" ON "albumHistory" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "albumStickers_by_member_person" ON "albumStickers" USING btree ("member","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "boardCountedAwards_by_award" ON "boardCountedAwards" USING btree ("award","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "boughtCrates_by_member_crate" ON "boughtCrates" USING btree ("member","crate","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "boughtCrates_by_member_n" ON "boughtCrates" USING btree ("member","n","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "boughtCrates_by_member_opened" ON "boughtCrates" USING btree ("member","openedAt" NULLS FIRST,"n","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "dropTallies_by_member" ON "dropTallies" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "drops_by_member_crate" ON "drops" USING btree ("member","crate","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "drops_by_member" ON "drops" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "emojiClasses_by_workspace_name" ON "emojiClasses" USING btree ("workspace","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "emojiClasses_by_workspace_class" ON "emojiClasses" USING btree ("workspace","class","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "emojiNameNumbers_by_workspace_stem" ON "emojiNameNumbers" USING btree ("workspace","stem","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "emojiNames_by_workspace_emoji" ON "emojiNames" USING btree ("workspace","emoji","person" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "emojiNames_by_workspace_name" ON "emojiNames" USING btree ("workspace","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "emojiNames_by_emoji" ON "emojiNames" USING btree ("emoji","person" NULLS FIRST,"workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "grantRecords_by_message_recipient" ON "grantRecords" USING btree ("message.workspace" NULLS FIRST,"message.conversation" NULLS FIRST,"message.message" NULLS FIRST,"recipient","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "grantsTold_by_message" ON "grantsTold" USING btree ("message.workspace" NULLS FIRST,"message.conversation" NULLS FIRST,"message.message" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "grantsTold_by_workspace_at" ON "grantsTold" USING btree ("message.workspace" NULLS FIRST,"at" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hoggieAvatars_by_member" ON "hoggieAvatars" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hoggieTallies_by_member_hoggie" ON "hoggieTallies" USING btree ("member","hoggie","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hypeReactions_by_giver_at" ON "hypeReactions" USING btree ("giver","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hypeReactions_by_giver_owner_message" ON "hypeReactions" USING btree ("giver","owner","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hypeReactions_by_giver_owner_author" ON "hypeReactions" USING btree ("giver","owner","author","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hypesCollected_by_member_person" ON "hypesCollected" USING btree ("member","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "items_by_member_turned" ON "items" USING btree ("member","turnedAt" NULLS FIRST,"earnedAt","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "items_by_member_source_key" ON "items" USING btree ("member","source","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "kudosEmojiPicks_by_member_emoji" ON "kudosEmojiPicks" USING btree ("member","emoji","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "milestoneTiers_by_member_milestone_tier" ON "milestoneTiers" USING btree ("member","milestone","tier","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "pairTallies_by_member_person" ON "pairTallies" USING btree ("member","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "petHoggies_by_workspace_member" ON "petHoggies" USING btree ("workspace","member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "randomEmojiDrops_by_member_name" ON "randomEmojiDrops" USING btree ("member","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "secondEmojiNames_by_workspace_name" ON "secondEmojiNames" USING btree ("workspace","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "seenEmojis_by_member_emoji" ON "seenEmojis" USING btree ("member","emoji","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "seenEmojis_by_member_at" ON "seenEmojis" USING btree ("member","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "talliedAwards_by_award" ON "talliedAwards" USING btree ("award","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "talliedHugs_by_hug_person" ON "talliedHugs" USING btree ("hug","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "teamStickers_by_member_team" ON "teamStickers" USING btree ("member","team","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "teamStickers_by_workspace_at" ON "teamStickers" USING btree ("workspace" NULLS FIRST,"at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulBoardTallies_by_workspace_period_giver" ON "thoughtfulBoardTallies" USING btree ("workspace","period","giver","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulGiverCounts_by_workspace_week" ON "thoughtfulGiverCounts" USING btree ("workspace","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulPacks_by_giver_recipient_week" ON "thoughtfulPacks" USING btree ("giver","recipient","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulPacks_by_giver_recipient" ON "thoughtfulPacks" USING btree ("giver","recipient","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulPacks_by_giver_recipient_sticker" ON "thoughtfulPacks" USING btree ("giver","recipient","holdsSticker","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulPacks_by_giver_opened_at" ON "thoughtfulPacks" USING btree ("giver","openedAt" NULLS FIRST,"at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulPacks_by_giver_at" ON "thoughtfulPacks" USING btree ("giver","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thoughtfulTallies_by_workspace_week_giver" ON "thoughtfulTallies" USING btree ("workspace","week","giver","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "trayDrops_by_member_crate" ON "trayDrops" USING btree ("member","crate","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "trayDrops_by_member_put_in" ON "trayDrops" USING btree ("member","putInAt" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "trayItems_by_member_put_in" ON "trayItems" USING btree ("member","putInAt" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "trayItems_by_member_put_in_kind" ON "trayItems" USING btree ("member","putInAt" NULLS FIRST,"kind","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "trayItems_by_pack_kind" ON "trayItems" USING btree ("pack","kind","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "weekPeople_by_member_week_list_person" ON "weekPeople" USING btree ("member","week","list","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "weekTallies_by_member_week" ON "weekTallies" USING btree ("member","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "analyticsIds_by_member" ON "analyticsIds" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "analyticsIds_by_analytics_id" ON "analyticsIds" USING btree ("analyticsId","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "analyticsIds_by_profile_fingerprint" ON "analyticsIds" USING btree ("profileFingerprint" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "analyticsOutbox_by_state" ON "analyticsOutbox" USING btree ("state","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "analyticsOutbox_by_due" ON "analyticsOutbox" USING btree ("state","dueAt","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "flagExposures_by_member_flag_value" ON "flagExposures" USING btree ("member","flag","value","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "recordedFacts_by_fact" ON "recordedFacts" USING btree ("fact","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "reportedJobs_by_job" ON "reportedJobs" USING btree ("job","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "watchedJobs_by_job" ON "watchedJobs" USING btree ("job","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "workspaceKeys_by_workspace" ON "workspaceKeys" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "replays_by_job" ON "replays" USING btree ("job","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "companyFaces_by_member" ON "companyFaces" USING btree ("workspace","member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "companyProfileLinks_by_member" ON "companyProfileLinks" USING btree ("workspace","member","by","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "companyProfileLinks_by_profile" ON "companyProfileLinks" USING btree ("workspace","profile" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "companyProfiles_by_normalised_name" ON "companyProfiles" USING btree ("normalisedName","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "companyTeams_by_team" ON "companyTeams" USING btree ("team","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "allowanceSpending_by_giver_day" ON "allowanceSpending" USING btree ("giver","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_giver" ON "awards" USING btree ("giver","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_giver_recipient" ON "awards" USING btree ("giver","recipient","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_recipient" ON "awards" USING btree ("recipient","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_recipient_at" ON "awards" USING btree ("recipient","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_giver_at" ON "awards" USING btree ("giver","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_recipient_decided" ON "awards" USING btree ("recipient","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_giver_decided" ON "awards" USING btree ("giver","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_message" ON "awards" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_message_recipient" ON "awards" USING btree ("workspace","conversation","message","recipient","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "awards_by_workspace" ON "awards" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "kudosMessages_by_message" ON "kudosMessages" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "kudosMessages_by_state_and_next_check" ON "kudosMessages" USING btree ("state","nextCheckAt" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "kudosTexts_by_message" ON "kudosTexts" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "kudosTexts_by_author" ON "kudosTexts" USING btree ("workspace","author" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "kudosTotals_by_member" ON "kudosTotals" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "spotlightDraws_by_position" ON "spotlightDraws" USING btree ("workspace","position","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "spotlightDraws_by_message" ON "spotlightDraws" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "wordDeletionRequests_by_author" ON "wordDeletionRequests" USING btree ("workspace","author" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "celebratedLevels_by_member_message" ON "celebratedLevels" USING btree ("member","workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "grantReplies_by_message" ON "grantReplies" USING btree ("message.workspace" NULLS FIRST,"message.conversation" NULLS FIRST,"message.message" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "homeSelections_by_member" ON "homeSelections" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "homes_by_member" ON "homes" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "indicators_by_message" ON "indicators" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "oneReplies_by_reply" ON "oneReplies" USING btree ("reply","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "privateReplies_by_held_message" ON "privateReplies" USING btree ("workspace","conversation","message","held" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "publicReplies_by_destination" ON "publicReplies" USING btree ("workspace","conversation" NULLS FIRST,"message" NULLS FIRST,"channel","threadTs" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "publicReplies_by_level_reached" ON "publicReplies" USING btree ("reached.member" NULLS FIRST,"reached.level" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "sentNotices_by_member_notice" ON "sentNotices" USING btree ("member","notice","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "thankYouNudges_by_message" ON "thankYouNudges" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "tierNotices_by_member_message" ON "tierNotices" USING btree ("member","workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "tierSummaries_by_member" ON "tierSummaries" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "welcomeNudges_by_member" ON "welcomeNudges" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "attributions_by_message" ON "attributions" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "attributions_by_group_at" ON "attributions" USING btree ("group" NULLS FIRST,"at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "groupCountingChanges_by_group_at" ON "groupCountingChanges" USING btree ("group","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "groupSettings_by_workspace" ON "groupSettings" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "memberGroups_by_member" ON "memberGroups" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "memberGroups_by_primary" ON "memberGroups" USING btree ("primary" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "primaryGroupHistory_by_member_at" ON "primaryGroupHistory" USING btree ("member","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "userGroupDepartures_by_user_at" ON "userGroupDepartures" USING btree ("workspace","user","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugCounts_by_message" ON "hugCounts" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugPeople_by_hug_member" ON "hugPeople" USING btree ("hug","member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugPeople_by_member_at" ON "hugPeople" USING btree ("member","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugWeekMessages_by_member_week_message" ON "hugWeekMessages" USING btree ("member","week","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugWeeks_by_member_week" ON "hugWeeks" USING btree ("member","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugWeeks_by_week" ON "hugWeeks" USING btree ("week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugs_by_message_giver" ON "hugs" USING btree ("workspace","conversation","message","giver","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugs_by_giver_day" ON "hugs" USING btree ("giver","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugs_by_giver_decided" ON "hugs" USING btree ("giver","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugsReceived_by_member" ON "hugsReceived" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugsReceived_by_member_message" ON "hugsReceived" USING btree ("member","workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "attributedGroupTotals_by_group_period" ON "attributedGroupTotals" USING btree ("group","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "attributedTotals_by_group_period" ON "attributedTotals" USING btree ("group","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "attributedTotals_by_member_group_period" ON "attributedTotals" USING btree ("member","group","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "countedAttributions_by_message" ON "countedAttributions" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "countedKudosGiven_by_message" ON "countedKudosGiven" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "countedRecognitions_by_key" ON "countedRecognitions" USING btree ("workspace","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "featuredNewGivers_by_workspace_week" ON "featuredNewGivers" USING btree ("workspace","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "givenByDay_by_member_day" ON "givenByDay" USING btree ("member","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "givenByDay_by_workspace_day" ON "givenByDay" USING btree ("workspace","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "givenTotals_by_period" ON "givenTotals" USING btree ("workspace","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "givenTotals_by_member_period" ON "givenTotals" USING btree ("member","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugRunningTotals_by_period" ON "hugRunningTotals" USING btree ("workspace","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugRunningTotals_by_member_period" ON "hugRunningTotals" USING btree ("member","period","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "leaderboardSettings_by_member" ON "leaderboardSettings" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "mondayPostClaims_by_workspace_week" ON "mondayPostClaims" USING btree ("workspace","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "mondayPostSettings_by_workspace" ON "mondayPostSettings" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "weekThankers_by_member_week_person" ON "weekThankers" USING btree ("member","week","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "messageSettings_by_member_kind" ON "messageSettings" USING btree ("member","kind","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "progressSettings_by_member" ON "progressSettings" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "mondayDmNudges_by_dm" ON "mondayDmNudges" USING btree ("dm","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "mondayDms_by_member_monday" ON "mondayDms" USING btree ("member","monday","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "mondayDms_by_state_due" ON "mondayDms" USING btree ("state","dueAt","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "effectsRecords_by_award" ON "effectsRecords" USING btree ("award","side","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "effectsRecords_by_member_side" ON "effectsRecords" USING btree ("member","side","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "memberProgress_by_member" ON "memberProgress" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "perkPurchases_by_member_key" ON "perkPurchases" USING btree ("member","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "perksOwned_by_member_perk" ON "perksOwned" USING btree ("member","perk","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "receivingGivers_by_recipient_week" ON "receivingGivers" USING btree ("recipient","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "rewardRecords_by_member_key" ON "rewardRecords" USING btree ("member","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "rewardRecords_by_member_cause" ON "rewardRecords" USING btree ("member","cause.workspace" NULLS FIRST,"cause.conversation" NULLS FIRST,"cause.message" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "hugLadders_by_member" ON "hugLadders" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questDraws_by_member_week" ON "questDraws" USING btree ("member","week","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questFinishes_by_member_key" ON "questFinishes" USING btree ("member","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questProgress_by_member_week_slot" ON "questProgress" USING btree ("member","week","slot","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questRecognitions_by_giver_key" ON "questRecognitions" USING btree ("giver","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questRecognitions_by_giver_day" ON "questRecognitions" USING btree ("giver","day","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questRecognitions_by_giver_source_at" ON "questRecognitions" USING btree ("giver","source","at","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questSideDraws_by_member_week_side" ON "questSideDraws" USING btree ("member","week","side","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questStarts_by_member" ON "questStarts" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "questsJudged_by_award" ON "questsJudged" USING btree ("award","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "cardPictures_by_key" ON "cardPictures" USING btree ("key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "firstSignIns_by_user" ON "firstSignIns" USING btree ("workspace","user","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "memberVerifications_by_user" ON "memberVerifications" USING btree ("workspace","user","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "memberVerifications_by_state_and_next_try" ON "memberVerifications" USING btree ("state","nextTryAt" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "placedReactions_by_message" ON "placedReactions" USING btree ("workspace","conversation","message","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "slackRateLimits_by_method" ON "slackRateLimits" USING btree ("workspace","method","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "slackReceipts_by_event" ON "slackReceipts" USING btree ("workspace","eventId","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "stickerBackfills_by_workspace" ON "stickerBackfills" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "stickers_by_member_person" ON "stickers" USING btree ("member","person","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "stickers_by_member_firstAt" ON "stickers" USING btree ("member","firstAt","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "teamPageChecks_by_member" ON "teamPageChecks" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "teamPageCompletions_by_member_team" ON "teamPageCompletions" USING btree ("member","team","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "collection_by_member_item" ON "collection" USING btree ("member","item","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "customKudosEmoji_by_workspace_name" ON "customKudosEmoji" USING btree ("workspace","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "itemPurchases_by_member_key" ON "itemPurchases" USING btree ("member","key","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "levelUps_by_member_level" ON "levelUps" USING btree ("member","level","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "levelUps_by_member" ON "levelUps" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "previewMoments_by_member_moment" ON "previewMoments" USING btree ("member","moment","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "unlockLaunches_by_workspace" ON "unlockLaunches" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "unlocks_by_member_feature" ON "unlocks" USING btree ("member","feature","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "coinSpends_by_member" ON "coinSpends" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "wallets_by_member" ON "wallets" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "howItWorksCloses_by_member" ON "howItWorksCloses" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "lastVisits_by_member" ON "lastVisits" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "users_by_chat_identity" ON "users" USING btree ("chatIdentity.workspace" NULLS FIRST,"chatIdentity.user" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "welcomes_by_member" ON "welcomes" USING btree ("member","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "celebrationsSwitches_by_workspace" ON "celebrationsSwitches" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "customEmoji_by_name" ON "customEmoji" USING btree ("workspace","name","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "customEmoji_by_listing" ON "customEmoji" USING btree ("workspace","listing","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "customEmojiListings_by_workspace" ON "customEmojiListings" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "listedMembers_by_user" ON "listedMembers" USING btree ("workspace","user","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "members_by_user" ON "members" USING btree ("workspace","user","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "members_by_admin" ON "members" USING btree ("workspace","admin" NULLS FIRST,"_creationTime","_id");--> statement-breakpoint
CREATE INDEX "userGroupMembers_by_group" ON "userGroupMembers" USING btree ("workspace","group","user","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "userGroupMembers_by_user" ON "userGroupMembers" USING btree ("workspace","user","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "userGroups_by_group" ON "userGroups" USING btree ("workspace","group","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "welcomeNudgeSwitches_by_workspace" ON "welcomeNudgeSwitches" USING btree ("workspace","_creationTime","_id");--> statement-breakpoint
CREATE INDEX "workspaces_by_workspace" ON "workspaces" USING btree ("workspace","_creationTime","_id");