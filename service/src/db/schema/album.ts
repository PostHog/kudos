// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.
import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";
import { bool, creationTime, documentTable, f64, i64, id, type Id, str, value } from "../columns.ts";
import { nullValued } from "../documents.ts";

export const thoughtfulGiverCounts = documentTable(
  "thoughtfulGiverCounts",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    week: str().notNull(),
    givers: f64().notNull(),
  },
  (t) => [
    index("thoughtfulGiverCounts_by_workspace_week").on(t.workspace, t.week, t._creationTime, t._id),
  ],
);

export const drops = documentTable(
  "drops",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    crate: str().notNull(),
    hoggie: str().notNull(),
    rarity: str().$type<"common" | "uncommon" | "rare" | "epic" | "legendary">().notNull(),
    n: f64().notNull(),
    copy: f64().notNull(),
    catalogueVersion: f64().notNull(),
    at: f64().notNull(),
    crest: value(),
    pack: value(),
  },
  (t) => [
    index("drops_by_member_crate").on(t.member, t.crate, t._creationTime, t._id),
    index("drops_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const hoggieTallies = documentTable(
  "hoggieTallies",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    hoggie: str().notNull(),
    count: f64().notNull(),
    firstAt: f64().notNull(),
    firstN: f64().notNull(),
  },
  (t) => [
    index("hoggieTallies_by_member_hoggie").on(t.member, t.hoggie, t._creationTime, t._id),
  ],
);

export const dropTallies = documentTable(
  "dropTallies",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    drops: f64().notNull(),
  },
  (t) => [
    index("dropTallies_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const trayDrops = documentTable(
  "trayDrops",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    crate: str().notNull(),
    putInAt: f64(),
    crest: value(),
  },
  (t) => [
    index("trayDrops_by_member_crate").on(t.member, t.crate, t._creationTime, t._id),
    index("trayDrops_by_member_put_in").on(t.member, t.putInAt.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const hoggieAvatars = documentTable(
  "hoggieAvatars",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    hoggie: str().notNull(),
  },
  (t) => [
    index("hoggieAvatars_by_member").on(t.member, t._creationTime, t._id),
  ],
);

export const petHoggies = documentTable(
  "petHoggies",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    hoggie: str().notNull(),
  },
  (t) => [
    index("petHoggies_by_workspace_member").on(t.workspace, t.member, t._creationTime, t._id),
  ],
);

export const thoughtfulPacks = documentTable(
  "thoughtfulPacks",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    recipient: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    message: value().notNull(),
    holdsSticker: bool().notNull(),
    at: f64().notNull(),
    openedAt: f64(),
  },
  (t) => [
    index("thoughtfulPacks_by_giver_recipient_week").on(t.giver, t.recipient, t.week, t._creationTime, t._id),
    index("thoughtfulPacks_by_giver_recipient").on(t.giver, t.recipient, t._creationTime, t._id),
    index("thoughtfulPacks_by_giver_recipient_sticker").on(t.giver, t.recipient, t.holdsSticker, t._creationTime, t._id),
    index("thoughtfulPacks_by_giver_opened_at").on(t.giver, t.openedAt.asc().nullsFirst(), t.at, t._creationTime, t._id),
    index("thoughtfulPacks_by_giver_at").on(t.giver, t.at, t._creationTime, t._id),
  ],
);

export const items = documentTable(
  "items",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    source: str().$type<"sticker" | "hoggie">().notNull(),
    key: str().notNull(),
    floor: str().$type<"common" | "uncommon" | "rare" | "epic" | "legendary">(),
    cap: str().$type<"common" | "uncommon" | "rare" | "epic" | "legendary">(),
    weights: str().$type<"base" | "kudos">(),
    reason: value().notNull(),
    earnedAt: f64().notNull(),
    turnedAt: f64(),
  },
  (t) => [
    index("items_by_member_turned").on(t.member, t.turnedAt.asc().nullsFirst(), t.earnedAt, t._creationTime, t._id),
    index("items_by_member_source_key").on(t.member, t.source, t.key, t._creationTime, t._id),
  ],
);

export const trayItems = documentTable(
  "trayItems",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    pack: str().$type<Id<"thoughtfulPacks">>().notNull(),
    at: f64().notNull(),
    putInAt: f64(),
    kind: str().$type<"sticker" | "hoggie">().notNull(),
    person: str().$type<Id<"members">>(),
    hoggie: str(),
    rarity: str().$type<"common" | "uncommon" | "rare" | "epic" | "legendary">(),
    isNew: bool(),
  },
  (t) => [
    index("trayItems_by_member_put_in").on(t.member, t.putInAt.asc().nullsFirst(), t._creationTime, t._id),
    index("trayItems_by_member_put_in_kind").on(t.member, t.putInAt.asc().nullsFirst(), t.kind, t._creationTime, t._id),
    index("trayItems_by_pack_kind").on(t.pack, t.kind, t._creationTime, t._id),
  ],
);

export const grantRecords = documentTable(
  "grantRecords",
  {
    _id: id(),
    _creationTime: creationTime(),
    giver: str().$type<Id<"members">>().notNull(),
    message: value().notNull(),
    recipient: str().$type<Id<"members">>().notNull(),
    outcome: str().$type<"new" | "held" | "waiting" | "nextWeek">().notNull(),
    message$workspace: str("message.workspace").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'workspace') WHEN 'string' THEN "message"->>'workspace' END`),
    message$conversation: str("message.conversation").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'conversation') WHEN 'string' THEN "message"->>'conversation' END`),
    message$message: str("message.message").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'message') WHEN 'string' THEN "message"->>'message' END`),
  },
  (t) => [
    index("grantRecords_by_message_recipient").on(t.message$workspace.asc().nullsFirst(), t.message$conversation.asc().nullsFirst(), t.message$message.asc().nullsFirst(), t.recipient, t._creationTime, t._id),
  ],
);

export const grantsTold = documentTable(
  "grantsTold",
  {
    _id: id(),
    _creationTime: creationTime(),
    message: value().notNull(),
    at: f64(),
    recipients: f64(),
    message$workspace: str("message.workspace").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'workspace') WHEN 'string' THEN "message"->>'workspace' END`),
    message$conversation: str("message.conversation").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'conversation') WHEN 'string' THEN "message"->>'conversation' END`),
    message$message: str("message.message").generatedAlwaysAs(sql`CASE jsonb_typeof("message"->'message') WHEN 'string' THEN "message"->>'message' END`),
  },
  (t) => [
    index("grantsTold_by_message").on(t.message$workspace.asc().nullsFirst(), t.message$conversation.asc().nullsFirst(), t.message$message.asc().nullsFirst(), t._creationTime, t._id),
    index("grantsTold_by_workspace_at").on(t.message$workspace.asc().nullsFirst(), t.at.asc().nullsFirst(), t._creationTime, t._id),
  ],
);

export const thoughtfulTallies = documentTable(
  "thoughtfulTallies",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    week: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    awards: f64().notNull(),
  },
  (t) => [
    index("thoughtfulTallies_by_workspace_week_giver").on(t.workspace, t.week, t.giver, t._creationTime, t._id),
  ],
);

export const thoughtfulBoardTallies = documentTable(
  "thoughtfulBoardTallies",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    period: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    awards: f64().notNull(),
  },
  (t) => [
    index("thoughtfulBoardTallies_by_workspace_period_giver").on(t.workspace, t.period, t.giver, t._creationTime, t._id),
  ],
);

export const boardCountedAwards = documentTable(
  "boardCountedAwards",
  {
    _id: id(),
    _creationTime: creationTime(),
    award: str().$type<Id<"awards">>().notNull(),
  },
  (t) => [
    index("boardCountedAwards_by_award").on(t.award, t._creationTime, t._id),
  ],
);

export const albumStickers = documentTable(
  "albumStickers",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    person: str().$type<Id<"members">>().notNull(),
    from: str().$type<"pack" | "history" | "reactions">().notNull(),
    pack: str().$type<Id<"thoughtfulPacks">>(),
    at: f64().notNull(),
  },
  (t) => [
    index("albumStickers_by_member_person").on(t.member, t.person, t._creationTime, t._id),
  ],
);

export const teamStickers = documentTable(
  "teamStickers",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    workspace: str(),
    team: str().notNull(),
    at: f64().notNull(),
    name: str().notNull(),
    art: value().notNull(),
    emoji: str().notNull(),
  },
  (t) => [
    index("teamStickers_by_member_team").on(t.member, t.team, t._creationTime, t._id),
    index("teamStickers_by_workspace_at").on(t.workspace.asc().nullsFirst(), t.at, t._creationTime, t._id),
  ],
);

export const milestoneTiers = documentTable(
  "milestoneTiers",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    milestone: str().$type<"people" | "teams" | "reach" | "hoggies" | "thoughtful">().notNull(),
    tier: str().$type<"bronze" | "silver" | "gold" | "diamond">().notNull(),
    at: f64().notNull(),
    catalogue: f64().notNull(),
  },
  (t) => [
    index("milestoneTiers_by_member_milestone_tier").on(t.member, t.milestone, t.tier, t._creationTime, t._id),
  ],
);

export const emojiNames = documentTable(
  "emojiNames",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    emoji: str().notNull(),
    person: str().$type<Id<"members">>(),
    name: str().notNull(),
    mappedBy: value(),
  },
  (t) => [
    index("emojiNames_by_workspace_emoji").on(t.workspace, t.emoji, t.person.asc().nullsFirst(), t._creationTime, t._id),
    index("emojiNames_by_workspace_name").on(t.workspace, t.name, t._creationTime, t._id),
    index("emojiNames_by_emoji").on(t.emoji, t.person.asc().nullsFirst(), t.workspace, t._creationTime, t._id),
  ],
);

export const secondEmojiNames = documentTable(
  "secondEmojiNames",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    emoji: str().notNull(),
    name: str().notNull(),
  },
  (t) => [
    index("secondEmojiNames_by_workspace_name").on(t.workspace, t.name, t._creationTime, t._id),
  ],
);

export const emojiNameNumbers = documentTable(
  "emojiNameNumbers",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    stem: str().notNull(),
    last: f64().notNull(),
  },
  (t) => [
    index("emojiNameNumbers_by_workspace_stem").on(t.workspace, t.stem, t._creationTime, t._id),
  ],
);

export const seenEmojis = documentTable(
  "seenEmojis",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    emoji: str().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("seenEmojis_by_member_emoji").on(t.member, t.emoji, t._creationTime, t._id),
    index("seenEmojis_by_member_at").on(t.member, t.at, t._creationTime, t._id),
  ],
);

export const kudosEmojiPicks = documentTable(
  "kudosEmojiPicks",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    emoji: str().notNull(),
  },
  (t) => [
    index("kudosEmojiPicks_by_member_emoji").on(t.member, t.emoji, t._creationTime, t._id),
  ],
);

export const emojiClasses = documentTable(
  "emojiClasses",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    name: str().notNull(),
    class: str().$type<"random" | "unmapped">().notNull(),
  },
  (t) => [
    index("emojiClasses_by_workspace_name").on(t.workspace, t.name, t._creationTime, t._id),
    index("emojiClasses_by_workspace_class").on(t.workspace, t.class, t.name, t._creationTime, t._id),
  ],
);

export const randomEmojiDrops = documentTable(
  "randomEmojiDrops",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    name: str().notNull(),
    pack: str().$type<Id<"thoughtfulPacks">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("randomEmojiDrops_by_member_name").on(t.member, t.name, t._creationTime, t._id),
  ],
);

export const albumHistory = documentTable(
  "albumHistory",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    startedAt: f64().notNull(),
    phase: str().$type<"kudos" | "hugs">().notNull(),
    cursor: str(),
    hug: str().$type<Id<"hugs">>(),
    hugPeopleAfter: str().$type<Id<"members">>(),
    done: bool().notNull(),
  },
  (t) => [
    index("albumHistory_by_workspace").on(t.workspace, t._creationTime, t._id),
  ],
);
nullValued(albumHistory, ["cursor"]);

export const pairTallies = documentTable(
  "pairTallies",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    person: str().$type<Id<"members">>().notNull(),
    firstThankedAt: f64(),
    kudosGiven: f64().notNull(),
    kudosReceived: f64().notNull(),
    hugsGiven: f64().notNull(),
    hugsReceived: f64().notNull(),
    best: value().notNull(),
  },
  (t) => [
    index("pairTallies_by_member_person").on(t.member, t.person, t._creationTime, t._id),
  ],
);
nullValued(pairTallies, ["firstThankedAt"]);

export const weekTallies = documentTable(
  "weekTallies",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    kudosGiven: f64().notNull(),
    kudosReceived: f64().notNull(),
    thoughtfulGiven: f64().notNull(),
    thoughtfulReceived: f64().notNull(),
    hugsGiven: f64().notNull(),
    hugsReceived: f64().notNull(),
    thanked: value().notNull(),
    thankedBy: value().notNull(),
    hugged: value().notNull(),
    huggedBy: value().notNull(),
    kudosOfWeek: value().notNull(),
    days: value().notNull(),
    packsOpened: f64(),
    newFaces: value(),
    hoggiesFound: value(),
  },
  (t) => [
    index("weekTallies_by_member_week").on(t.member, t.week, t._creationTime, t._id),
  ],
);

export const weekPeople = documentTable(
  "weekPeople",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    week: str().notNull(),
    list: str().$type<"thanked" | "thankedBy" | "hugged" | "huggedBy">().notNull(),
    person: str().$type<Id<"members">>().notNull(),
  },
  (t) => [
    index("weekPeople_by_member_week_list_person").on(t.member, t.week, t.list, t.person, t._creationTime, t._id),
  ],
);

export const talliedAwards = documentTable(
  "talliedAwards",
  {
    _id: id(),
    _creationTime: creationTime(),
    award: str().$type<Id<"awards">>().notNull(),
    everyKudos: bool().$type<true>(),
  },
  (t) => [
    index("talliedAwards_by_award").on(t.award, t._creationTime, t._id),
  ],
);

export const talliedHugs = documentTable(
  "talliedHugs",
  {
    _id: id(),
    _creationTime: creationTime(),
    hug: str().$type<Id<"hugs">>().notNull(),
    person: str().$type<Id<"members">>().notNull(),
  },
  (t) => [
    index("talliedHugs_by_hug_person").on(t.hug, t.person, t._creationTime, t._id),
  ],
);

export const hypeReactions = documentTable(
  "hypeReactions",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    giver: str().$type<Id<"members">>().notNull(),
    owner: str().$type<Id<"members">>().notNull(),
    author: str().$type<Id<"members">>().notNull(),
    emoji: str().notNull(),
    conversation: str().notNull(),
    message: str().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("hypeReactions_by_giver_at").on(t.giver, t.at, t._creationTime, t._id),
    index("hypeReactions_by_giver_owner_message").on(t.giver, t.owner, t.conversation, t.message, t._creationTime, t._id),
    index("hypeReactions_by_giver_owner_author").on(t.giver, t.owner, t.author, t._creationTime, t._id),
  ],
);

export const hypesCollected = documentTable(
  "hypesCollected",
  {
    _id: id(),
    _creationTime: creationTime(),
    workspace: str().notNull(),
    member: str().$type<Id<"members">>().notNull(),
    person: str().$type<Id<"members">>().notNull(),
    at: f64().notNull(),
  },
  (t) => [
    index("hypesCollected_by_member_person").on(t.member, t.person, t._creationTime, t._id),
  ],
);

export const boughtCrates = documentTable(
  "boughtCrates",
  {
    _id: id(),
    _creationTime: creationTime(),
    member: str().$type<Id<"members">>().notNull(),
    crate: str().notNull(),
    n: f64().notNull(),
    boughtAt: f64().notNull(),
    openedAt: f64(),
  },
  (t) => [
    index("boughtCrates_by_member_crate").on(t.member, t.crate, t._creationTime, t._id),
    index("boughtCrates_by_member_n").on(t.member, t.n, t._creationTime, t._id),
    index("boughtCrates_by_member_opened").on(t.member, t.openedAt.asc().nullsFirst(), t.n, t._creationTime, t._id),
  ],
);

export interface AlbumDocuments {
  thoughtfulGiverCounts: { _id: Id<"thoughtfulGiverCounts">; _creationTime: number } & ({ "workspace": string; "week": string; "givers": number });
  drops: { _id: Id<"drops">; _creationTime: number } & ({ "member": Id<"members">; "crate": string; "hoggie": string; "rarity": "common" | "uncommon" | "rare" | "epic" | "legendary"; "n": number; "copy": number; "catalogueVersion": number; "at": number; "crest"?: string | null; "pack"?: { "xp": number; "coins": number; "from": { "xp": number; "level": number; "coins": number; "skillPoints": number }; "to": { "xp": number; "level": number; "coins": number; "skillPoints": number } } });
  hoggieTallies: { _id: Id<"hoggieTallies">; _creationTime: number } & ({ "member": Id<"members">; "hoggie": string; "count": number; "firstAt": number; "firstN": number });
  dropTallies: { _id: Id<"dropTallies">; _creationTime: number } & ({ "member": Id<"members">; "drops": number });
  trayDrops: { _id: Id<"trayDrops">; _creationTime: number } & ({ "member": Id<"members">; "crate": string; "putInAt"?: number; "crest"?: string | null });
  hoggieAvatars: { _id: Id<"hoggieAvatars">; _creationTime: number } & ({ "member": Id<"members">; "hoggie": string });
  petHoggies: { _id: Id<"petHoggies">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "hoggie": string });
  thoughtfulPacks: { _id: Id<"thoughtfulPacks">; _creationTime: number } & ({ "workspace": string; "giver": Id<"members">; "recipient": Id<"members">; "week": string; "message": { "workspace": string; "conversation": string; "message": string }; "holdsSticker": boolean; "at": number; "openedAt"?: number });
  items: { _id: Id<"items">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "source": "sticker" | "hoggie"; "key": string; "floor"?: "common" | "uncommon" | "rare" | "epic" | "legendary"; "cap"?: "common" | "uncommon" | "rare" | "epic" | "legendary"; "weights"?: "base" | "kudos"; "reason": { "kind": "thanks"; "person": Id<"members">; "message": { "workspace": string; "conversation": string; "message": string } } | { "kind": "levelUp"; "level": number } | { "kind": "welcome" } | { "kind": "team"; "team": string; "name": string } | { "kind": "milestone"; "milestone": "people" | "teams" | "reach" | "hoggies" | "thoughtful"; "tier": "bronze" | "silver" | "gold" | "diamond" } | { "kind": "forge"; "hoggie": string } | { "kind": "quest"; "quest": { "kind": "journey"; "step": "first-thanks" | "first-quest" | "someone-new" | "two-days" | "your-emoji" | "hugs-3" | "hugs-5" | "hugs-10" } | { "kind": "weekly"; "week": string; "slot": number } } | { "kind": "hug" }; "earnedAt": number; "turnedAt"?: number });
  trayItems: { _id: Id<"trayItems">; _creationTime: number } & ({ "member": Id<"members">; "pack": Id<"thoughtfulPacks">; "at": number; "putInAt"?: number; "kind": "sticker"; "person": Id<"members"> } | { "member": Id<"members">; "pack": Id<"thoughtfulPacks">; "at": number; "putInAt"?: number; "kind": "hoggie"; "hoggie": string; "rarity": "common" | "uncommon" | "rare" | "epic" | "legendary"; "isNew": boolean });
  grantRecords: { _id: Id<"grantRecords">; _creationTime: number } & ({ "giver": Id<"members">; "message": { "workspace": string; "conversation": string; "message": string }; "recipient": Id<"members">; "outcome": "new" | "held" | "waiting" | "nextWeek" });
  grantsTold: { _id: Id<"grantsTold">; _creationTime: number } & ({ "message": { "workspace": string; "conversation": string; "message": string }; "at"?: number; "recipients"?: number });
  thoughtfulTallies: { _id: Id<"thoughtfulTallies">; _creationTime: number } & ({ "workspace": string; "week": string; "giver": Id<"members">; "awards": number });
  thoughtfulBoardTallies: { _id: Id<"thoughtfulBoardTallies">; _creationTime: number } & ({ "workspace": string; "period": string; "giver": Id<"members">; "awards": number });
  boardCountedAwards: { _id: Id<"boardCountedAwards">; _creationTime: number } & ({ "award": Id<"awards"> });
  albumStickers: { _id: Id<"albumStickers">; _creationTime: number } & ({ "member": Id<"members">; "person": Id<"members">; "from": "pack" | "history" | "reactions"; "pack"?: Id<"thoughtfulPacks">; "at": number });
  teamStickers: { _id: Id<"teamStickers">; _creationTime: number } & ({ "member": Id<"members">; "workspace"?: string; "team": string; "at": number; "name": string; "art": { "kind": "crest"; "slug": string } | { "kind": "image"; "url": string } | null; "emoji": string });
  milestoneTiers: { _id: Id<"milestoneTiers">; _creationTime: number } & ({ "member": Id<"members">; "milestone": "people" | "teams" | "reach" | "hoggies" | "thoughtful"; "tier": "bronze" | "silver" | "gold" | "diamond"; "at": number; "catalogue": number });
  emojiNames: { _id: Id<"emojiNames">; _creationTime: number } & ({ "workspace": string; "emoji": string; "person"?: Id<"members">; "name": string; "mappedBy"?: { "member": Id<"members">; "as": "member" | "maintainer" } });
  secondEmojiNames: { _id: Id<"secondEmojiNames">; _creationTime: number } & ({ "workspace": string; "emoji": string; "name": string });
  emojiNameNumbers: { _id: Id<"emojiNameNumbers">; _creationTime: number } & ({ "workspace": string; "stem": string; "last": number });
  seenEmojis: { _id: Id<"seenEmojis">; _creationTime: number } & ({ "member": Id<"members">; "emoji": string; "at": number });
  kudosEmojiPicks: { _id: Id<"kudosEmojiPicks">; _creationTime: number } & ({ "member": Id<"members">; "emoji": string });
  emojiClasses: { _id: Id<"emojiClasses">; _creationTime: number } & ({ "workspace": string; "name": string; "class": "random" | "unmapped" });
  randomEmojiDrops: { _id: Id<"randomEmojiDrops">; _creationTime: number } & ({ "member": Id<"members">; "name": string; "pack": Id<"thoughtfulPacks">; "at": number });
  albumHistory: { _id: Id<"albumHistory">; _creationTime: number } & ({ "workspace": string; "startedAt": number; "phase": "kudos" | "hugs"; "cursor": string | null; "hug"?: Id<"hugs">; "hugPeopleAfter"?: Id<"members">; "done": boolean });
  pairTallies: { _id: Id<"pairTallies">; _creationTime: number } & ({ "member": Id<"members">; "person": Id<"members">; "firstThankedAt": number | null; "kudosGiven": number; "kudosReceived": number; "hugsGiven": number; "hugsReceived": number; "best": { "message": { "workspace": string; "conversation": string; "message": string }; "words": number; "at": number } | null });
  weekTallies: { _id: Id<"weekTallies">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "kudosGiven": number; "kudosReceived": number; "thoughtfulGiven": number; "thoughtfulReceived": number; "hugsGiven": number; "hugsReceived": number; "thanked": { "people": Array<Id<"members">>; "more": number }; "thankedBy": { "people": Array<Id<"members">>; "more": number }; "hugged": { "people": Array<Id<"members">>; "more": number }; "huggedBy": { "people": Array<Id<"members">>; "more": number }; "kudosOfWeek": { "message": { "workspace": string; "conversation": string; "message": string }; "hugs": number; "words": number; "at": number } | null; "days": Array<number>; "packsOpened"?: number; "newFaces"?: { "people": Array<Id<"members">>; "more": number }; "hoggiesFound"?: { "hoggies": Array<{ "hoggie": string; "rarity": "common" | "uncommon" | "rare" | "epic" | "legendary" }>; "more": number } });
  weekPeople: { _id: Id<"weekPeople">; _creationTime: number } & ({ "member": Id<"members">; "week": string; "list": "thanked" | "thankedBy" | "hugged" | "huggedBy"; "person": Id<"members"> });
  talliedAwards: { _id: Id<"talliedAwards">; _creationTime: number } & ({ "award": Id<"awards">; "everyKudos"?: true });
  talliedHugs: { _id: Id<"talliedHugs">; _creationTime: number } & ({ "hug": Id<"hugs">; "person": Id<"members"> });
  hypeReactions: { _id: Id<"hypeReactions">; _creationTime: number } & ({ "workspace": string; "giver": Id<"members">; "owner": Id<"members">; "author": Id<"members">; "emoji": string; "conversation": string; "message": string; "at": number });
  hypesCollected: { _id: Id<"hypesCollected">; _creationTime: number } & ({ "workspace": string; "member": Id<"members">; "person": Id<"members">; "at": number });
  boughtCrates: { _id: Id<"boughtCrates">; _creationTime: number } & ({ "member": Id<"members">; "crate": string; "n": number; "boughtAt": number; "openedAt"?: number });
}
