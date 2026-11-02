import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { awardLadderValidator, ladderValidator } from "./achievements/ladders";
import { messageKindValidator, messagePlaceValidator } from "./messageSettings/kinds";
import { bookReplayCursorValidator, bookReplayValidator } from "./achievements/replay";
import { earnedTierValidator } from "./achievements/tiers";
import { exceptionValidator } from "./analytics/exceptions";
import { awardIdValidator } from "./engine/awards";
import { personPropertiesValidator, propertiesValidator } from "./analytics/projections";
import { kudosTextValidator } from "./engine/kudosText";
import { annotationsValidator, countableContentValidator, messageRefValidator } from "./engine/messageEvent";
import { homeTabValidator } from "./feedback/homes";
import { attributedAwardValidator, groupOrNoneValidator } from "./groups/attributedAward";
import { primaryGroupCauseValidator } from "./groups/cause";
import { groupModeValidator } from "./groups/mode";
import { celebratedLevelValidator, publicReplyValidator } from "./feedback/publicReplies";
import { grantReplyValidator } from "./feedback/albumReplies";
import { sentNoticeValidator } from "./feedback/sentNotices";
import { tierNoticeValidator, tierSummaryValidator } from "./feedback/tierNotices";
import { gainsValidator } from "./feedback/replies";
import { oneReplyValidator } from "./feedback/oneReply";
import { segmentValidator } from "./feedback/segments";
import { channelCheckValidator, mondayPostOutcomeValidator } from "./leaderboard/mondayPostOutcome";
import { periodValidator } from "./leaderboard/periods";
import { purchaseOutcomeValidator } from "./progression/purchases";
import { effectsRecordValidator } from "./progression/progress";
import { rewardRecordValidator } from "./progression/rewards";
import { perkValidator } from "./progression/tree";
import { boughtCrateValidator, dropTallyValidator, dropValidator, hoggieAvatarValidator, hoggieTallyValidator, petHoggieValidator, trayDropValidator } from "./album/hoggies/records";
import { itemValidator } from "./album/items/records";
import { mondayDmNudgeValidator, mondayDmValidator } from "./mondayDm/records";
import { teamPageCheckValidator, teamPageCompletionValidator } from "./stickers/completionRecords";
import { stickerBackfillValidator, stickerValidator } from "./stickers/records";
import {
  albumHistoryValidator,
  albumStickerValidator,
  emojiNameNumberValidator,
  seenEmojiValidator,
  kudosEmojiPickValidator,
  emojiClassValidator,
  randomEmojiDropValidator,
  emojiNameValidator,
  secondEmojiNameValidator,
  grantRecordValidator,
  grantToldValidator,
  milestoneTierRecordValidator,
  pairTallyValidator,
  talliedAwardValidator,
  talliedHugValidator,
  hypeReactionValidator,
  hypeCollectedValidator,
  teamStickerValidator,
  thoughtfulPackValidator,
  thoughtfulTallyValidator,
  thoughtfulBoardTallyValidator,
  boardCountedAwardValidator,
  trayItemValidator,
  weekPersonValidator,
  weekTallyValidator,
} from "./album/records";
import { questFinishValidator } from "./quests/finishes";
import { questsJudgedValidator } from "./quests/judged";
import { questRecognitionValidator } from "./quests/recognitions";
import { questDrawValidator, questProgressValidator } from "./quests/weekly";
import { collectedItemValidator, customKudosEmojiValidator, itemPurchaseValidator } from "./store/rows";
import { featureValidator } from "./unlocks/feature";
import { welcomedAsValidator, welcomePathValidator } from "./welcome/welcomedAs";
import { directoryEntryValidator } from "./workspace/directoryEntry";
import { memberProfileFields } from "./workspace/memberProfile";
import { coinSpendValidator } from "./wallet/wallet";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    givenName: v.optional(v.string()),
    familyName: v.optional(v.string()),
    image: v.optional(v.string()),
    chatIdentity: v.optional(v.object({ workspace: v.string(), user: v.string() })),
  }).index("by_chat_identity", ["chatIdentity.workspace", "chatIdentity.user"]),

  memberVerifications: defineTable({
    workspace: v.string(),
    user: v.string(),
    attempts: v.number(),
    state: v.union(v.literal("pending"), v.literal("failed")),
    nextTryAt: v.optional(v.number()),
  })
    .index("by_user", ["workspace", "user"])
    .index("by_state_and_next_try", ["state", "nextTryAt"]),

  firstSignIns: defineTable({ workspace: v.string(), user: v.string() }).index("by_user", ["workspace", "user"]),

  websiteClock: defineTable({
    tick: v.number(),
  }),

  lastVisits: defineTable({ member: v.id("members"), at: v.number() }).index("by_member", ["member"]),

  howItWorksCloses: defineTable({ member: v.id("members"), triedSlack: v.boolean(), at: v.number() }).index("by_member", ["member"]),

  companyProfiles: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    normalisedName: v.string(),
    image: v.optional(v.string()),
    colour: v.string(),
    team: v.optional(v.string()),
    profile: v.optional(v.number()),
    teams: v.optional(v.array(v.string())),
    role: v.optional(v.string()),
    asOf: v.optional(v.number()),
  }).index("by_normalised_name", ["normalisedName"]),

  companyTeams: defineTable({
    team: v.string(),
    name: v.string(),
    crestImage: v.optional(v.string()),
    leads: v.array(v.number()),
    people: v.array(v.number()),
    asOf: v.number(),
  }).index("by_team", ["team"]),

  companyFaces: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    face: v.union(v.object({ image: v.string(), colour: v.string() }), v.null()),
    profile: v.optional(v.number()),
  }).index("by_member", ["workspace", "member"]),

  companyProfileLinks: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    profile: v.union(v.number(), v.null()),
    by: v.union(v.literal("self"), v.literal("admin")),
    setBy: v.id("members"),
    at: v.number(),
  })
    .index("by_member", ["workspace", "member", "by"])
    .index("by_profile", ["workspace", "profile"]),

  slackReceipts: defineTable({
    workspace: v.string(),
    eventId: v.string(),
  }).index("by_event", ["workspace", "eventId"]),

  workspaces: defineTable({
    workspace: v.string(),
    baseAllowance: v.optional(v.number()),
    kudosEmoji: v.optional(v.string()),
    announcementChannel: v.optional(v.string()),
    hugBudget: v.optional(v.number()),
    url: v.optional(v.string()),
    urlRequestedAt: v.optional(v.number()),
  }).index("by_workspace", ["workspace"]),

  members: defineTable({
    workspace: v.string(),
    user: v.string(),
    kind: v.union(v.literal("member"), v.literal("bot"), v.literal("not-a-member")),
    name: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    admin: v.optional(v.boolean()),
    ...memberProfileFields,
    asOf: v.optional(v.number()),
    profileAsOf: v.optional(v.number()),
  })
    .index("by_user", ["workspace", "user"])
    .index("by_admin", ["workspace", "admin"]),

  listedMembers: defineTable({ workspace: v.string(), user: v.string(), entry: directoryEntryValidator, asOf: v.number() }).index("by_user", ["workspace", "user"]),

  userGroups: defineTable({
    workspace: v.string(),
    group: v.string(),
    handle: v.string(),
    name: v.string(),
    enabled: v.boolean(),
    automatic: v.boolean(),
    members: v.optional(v.number()),
    membersCountAsOf: v.optional(v.number()),
    asOf: v.number(),
    membersAsOf: v.optional(v.number()),
    changedAt: v.optional(v.number()),
    allowlistChangedAt: v.optional(v.number()),
  }).index("by_group", ["workspace", "group"]),

  userGroupMembers: defineTable({
    workspace: v.string(),
    group: v.string(),
    user: v.string(),
  })
    .index("by_group", ["workspace", "group", "user"])
    .index("by_user", ["workspace", "user"]),

  userGroupDepartures: defineTable({
    workspace: v.string(),
    user: v.string(),
    group: v.id("userGroups"),
    joinedAt: v.number(),
    at: v.number(),
  }).index("by_user_at", ["workspace", "user", "at"]),

  groupCountingChanges: defineTable({
    workspace: v.string(),
    group: v.id("userGroups"),
    counts: v.boolean(),
    at: v.number(),
  }).index("by_group_at", ["group", "at"]),

  memberGroups: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    groups: v.array(v.id("userGroups")),
    primary: v.union(v.id("userGroups"), v.null()),
    directoryChangedAt: v.optional(v.number()),
  })
    .index("by_member", ["member"])
    .index("by_primary", ["primary"]),

  groupSettings: defineTable({
    workspace: v.string(),
    mode: groupModeValidator,
    allowlist: v.optional(v.array(v.id("userGroups"))),
  }).index("by_workspace", ["workspace"]),

  primaryGroupHistory: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    from: v.union(v.id("userGroups"), v.null()),
    group: v.union(v.id("userGroups"), v.null()),
    cause: primaryGroupCauseValidator,
    at: v.number(),
  }).index("by_member_at", ["member", "at"]),

  attributions: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    giver: v.id("members"),
    group: groupOrNoneValidator,
    kudos: v.number(),
    day: v.string(),
    at: v.number(),
    awards: v.array(attributedAwardValidator),
  })
    .index("by_message", ["workspace", "conversation", "message"])
    .index("by_group_at", ["group", "at"]),

  customEmoji: defineTable({
    workspace: v.string(),
    name: v.string(),
    image: v.string(),
    aliasOf: v.optional(v.string()),
    listing: v.number(),
  })
    .index("by_name", ["workspace", "name"])
    .index("by_listing", ["workspace", "listing"]),

  customEmojiListings: defineTable({
    workspace: v.string(),
    begun: v.number(),
    written: v.optional(v.number()),
    refreshDueAt: v.optional(v.number()),
    scopeMissing: v.optional(v.boolean()),
  }).index("by_workspace", ["workspace"]),

  kudosMessages: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    threadRoot: v.optional(v.string()),
    author: v.string(),
    revision: v.int64(),
    state: v.union(
      v.literal("watermark"),
      v.literal("awaiting-directory"),
      v.literal("abandoned"),
      v.literal("given"),
      v.literal("over-allowance"),
      v.literal("invalid"),
      v.literal("withdrawn"),
    ),
    attempt: v.int64(),
    retry: v.optional(v.boolean()),
    content: countableContentValidator,
    annotations: annotationsValidator,
    spendsAt: v.number(),
    checks: v.number(),
    nextCheckAt: v.optional(v.number()),
  })
    .index("by_message", ["workspace", "conversation", "message"])
    .index("by_state_and_next_check", ["state", "nextCheckAt"]),

  kudosTexts: defineTable(kudosTextValidator).index("by_message", ["workspace", "conversation", "message"]).index("by_author", ["workspace", "author"]),
  wordDeletionRequests: defineTable({ workspace: v.string(), author: v.union(v.string(), v.null()) }).index("by_author", ["workspace", "author"]),

  spotlightDraws: defineTable({ ...messageRefValidator.fields, position: v.number() })
    .index("by_position", ["workspace", "position"])
    .index("by_message", ["workspace", "conversation", "message"]),

  awards: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    giver: v.id("members"),
    recipient: v.id("members"),
    kudos: v.number(),
    day: v.string(),
    at: v.number(),
  })
    .index("by_giver", ["giver", "day"])
    .index("by_giver_recipient", ["giver", "recipient"])
    .index("by_recipient", ["recipient", "day"])
    .index("by_recipient_at", ["recipient", "at"])
    .index("by_giver_at", ["giver", "at"])
    .index("by_recipient_decided", ["recipient"])
    .index("by_giver_decided", ["giver"])
    .index("by_message", ["workspace", "conversation", "message"])
    .index("by_message_recipient", ["workspace", "conversation", "message", "recipient"])
    .index("by_workspace", ["workspace"]),

  hugWeeks: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    week: v.string(),
    given: v.number(),
    givenXp: v.number(),
    received: v.number(),
    receivedXp: v.number(),
    mostHugged: v.optional(v.object({ conversation: v.string(), message: v.string(), hugs: v.number(), lastAt: v.number() })),
    recap: v.union(v.literal("waiting"), v.literal("scheduled"), v.literal("sent"), v.literal("skipped"), v.literal("failed"), v.literal("monday-dm")),
    dueAt: v.optional(v.number()),
    tries: v.number(),
  })
    .index("by_member_week", ["member", "week"])
    .index("by_week", ["week"]),

  mondayDms: defineTable(mondayDmValidator).index("by_member_monday", ["member", "monday"]).index("by_state_due", ["state", "dueAt"]),

  mondayDmNudges: defineTable(mondayDmNudgeValidator).index("by_dm", ["dm"]),

  hugWeekMessages: defineTable({ member: v.id("members"), week: v.string(), conversation: v.string(), message: v.string(), hugs: v.number(), lastAt: v.number() }).index("by_member_week_message", [
    "member",
    "week",
    "conversation",
    "message",
  ]),

  hugCounts: defineTable({ workspace: v.string(), conversation: v.string(), message: v.string(), hugs: v.number() }).index("by_message", ["workspace", "conversation", "message"]),

  hugs: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    giver: v.id("members"),
    onKudos: v.boolean(),
    author: v.optional(v.id("members")),
    emoji: v.string(),
    at: v.number(),
    day: v.string(),
  })
    .index("by_message_giver", ["workspace", "conversation", "message", "giver"])
    .index("by_giver_day", ["giver", "day"])
    .index("by_giver_decided", ["giver"]),

  hugPeople: defineTable({ hug: v.id("hugs"), member: v.id("members"), at: v.number() }).index("by_hug_member", ["hug", "member"]).index("by_member_at", ["member", "at"]),

  hugsReceived: defineTable({
    member: v.id("members"),
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    onKudos: v.boolean(),
    hugs: v.number(),
    emoji: v.string(),
    at: v.number(),
    givers: v.array(v.object({ giver: v.id("members"), at: v.number() })),
    supersededAt: v.optional(v.number()),
  })
    .index("by_member", ["member"])
    .index("by_member_message", ["member", "workspace", "conversation", "message"]),

  kudosTotals: defineTable({
    member: v.id("members"),
    given: v.number(),
    received: v.number(),
  }).index("by_member", ["member"]),

  allowanceSpending: defineTable({
    giver: v.id("members"),
    day: v.string(),
    spent: v.number(),
  }).index("by_giver_day", ["giver", "day"]),

  welcomes: defineTable({
    member: v.id("members"),
    welcomed: v.optional(welcomedAsValidator),
    path: v.optional(welcomePathValidator),
  }).index("by_member", ["member"]),

  welcomeNudges: defineTable({ member: v.id("members"), at: v.number() }).index("by_member", ["member"]),

  welcomeNudgeSwitches: defineTable({ workspace: v.string(), on: v.boolean() }).index("by_workspace", ["workspace"]),

  celebrationsSwitches: defineTable({ workspace: v.string(), on: v.boolean() }).index("by_workspace", ["workspace"]),

  thoughtfulGiverCounts: defineTable({ workspace: v.string(), week: v.string(), givers: v.number() }).index("by_workspace_week", ["workspace", "week"]),

  indicators: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    emoji: v.union(v.string(), v.null()),
    version: v.number(),
  }).index("by_message", ["workspace", "conversation", "message"]),

  privateReplies: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    threadRoot: v.optional(v.string()),
    to: v.string(),
    given: v.optional(v.array(segmentValidator)),
    lines: v.array(v.array(segmentValidator)),
    questsDone: v.optional(v.array(segmentValidator)),
    hint: v.optional(v.array(segmentValidator)),
    gains: v.optional(gainsValidator),
    held: v.optional(v.literal(true)),
  }).index("by_held_message", ["workspace", "conversation", "message", "held"]),

  oneReplies: defineTable(oneReplyValidator).index("by_reply", ["reply"]),

  grantReplies: defineTable(grantReplyValidator).index("by_message", ["message.workspace", "message.conversation", "message.message"]),

  sentNotices: defineTable(sentNoticeValidator).index("by_member_notice", ["member", "notice"]),

  celebratedLevels: defineTable(celebratedLevelValidator).index("by_member_message", ["member", "workspace", "conversation", "message"]),

  publicReplies: defineTable(publicReplyValidator)
    .index("by_destination", ["workspace", "conversation", "message", "channel", "threadTs"])
    .index("by_level_reached", ["reached.member", "reached.level"]),

  placedReactions: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
    emoji: v.array(v.string()),
  }).index("by_message", ["workspace", "conversation", "message"]),

  effectsRecords: defineTable(effectsRecordValidator).index("by_award", ["award", "side"]).index("by_member_side", ["member", "side"]),

  rewardRecords: defineTable(rewardRecordValidator)
    .index("by_member_key", ["member", "key"])
    .index("by_member_cause", ["member", "cause.workspace", "cause.conversation", "cause.message"]),

  receivingGivers: defineTable({
    recipient: v.id("members"),
    week: v.string(),
    giver: v.id("members"),
  }).index("by_recipient_week", ["recipient", "week"]),

  wallets: defineTable({
    member: v.id("members"),
    balance: v.number(),
  }).index("by_member", ["member"]),

  coinSpends: defineTable(coinSpendValidator).index("by_member", ["member"]),

  collection: defineTable(collectedItemValidator).index("by_member_item", ["member", "item"]),

  itemPurchases: defineTable(itemPurchaseValidator).index("by_member_key", ["member", "key"]),

  customKudosEmoji: defineTable(customKudosEmojiValidator).index("by_workspace_name", ["workspace", "name"]),

  questStarts: defineTable({ member: v.id("members"), at: v.number() }).index("by_member", ["member"]),

  bookLaunches: defineTable({
    workspace: v.string(),
    at: v.number(),
  }).index("by_workspace", ["workspace"]),

  ladderCounts: defineTable({
    member: v.id("members"),
    ladder: ladderValidator,
    count: v.number(),
  }).index("by_member_ladder", ["member", "ladder"]),

  ladderMarks: defineTable({
    member: v.id("members"),
    ladder: awardLadderValidator,
    group: v.string(),
    key: v.string(),
  }).index("by_member_ladder_group", ["member", "ladder", "group"]),

  countedAwards: defineTable({
    award: awardIdValidator,
    member: v.id("members"),
    ladder: awardLadderValidator,
    count: v.number(),
    at: v.number(),
  })
    .index("by_award_member_ladder", ["award", "member", "ladder"])
    .index("by_member_ladder_count", ["member", "ladder", "count"]),

  bookBatches: defineTable({
    workspace: v.string(),
    at: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_workspace", ["workspace"]),

  bookReplays: defineTable(bookReplayValidator).index("by_workspace_ladder", ["workspace", "ladder"]).index("by_batch", ["batch"]),

  bookReplayCursors: defineTable(bookReplayCursorValidator).index("by_replay", ["replay"]),

  earnedTiers: defineTable(earnedTierValidator).index("by_member_ladder_tier", ["member", "ladder", "tier"]),

  tierNotices: defineTable(tierNoticeValidator).index("by_member_message", ["member", "workspace", "conversation", "message"]),

  tierSummaries: defineTable(tierSummaryValidator).index("by_member", ["member"]),

  questDraws: defineTable(questDrawValidator).index("by_member_week", ["member", "week"]),

  questProgress: defineTable(questProgressValidator).index("by_member_week_slot", ["member", "week", "slot"]),

  drops: defineTable(dropValidator).index("by_member_crate", ["member", "crate"]).index("by_member", ["member"]),

  hoggieTallies: defineTable(hoggieTallyValidator).index("by_member_hoggie", ["member", "hoggie"]),

  dropTallies: defineTable(dropTallyValidator).index("by_member", ["member"]),

  trayDrops: defineTable(trayDropValidator).index("by_member_crate", ["member", "crate"]).index("by_member_put_in", ["member", "putInAt"]),

  hoggieAvatars: defineTable(hoggieAvatarValidator).index("by_member", ["member"]),

  petHoggies: defineTable(petHoggieValidator).index("by_workspace_member", ["workspace", "member"]),

  stickers: defineTable(stickerValidator).index("by_member_person", ["member", "person"]).index("by_member_firstAt", ["member", "firstAt"]),

  stickerBackfills: defineTable(stickerBackfillValidator).index("by_workspace", ["workspace"]),

  thoughtfulPacks: defineTable(thoughtfulPackValidator)
    .index("by_giver_recipient_week", ["giver", "recipient", "week"])
    .index("by_giver_recipient", ["giver", "recipient"])
    .index("by_giver_recipient_sticker", ["giver", "recipient", "holdsSticker"])
    .index("by_giver_opened_at", ["giver", "openedAt", "at"])
    .index("by_giver_at", ["giver", "at"]),

  items: defineTable(itemValidator).index("by_member_turned", ["member", "turnedAt", "earnedAt"]).index("by_member_source_key", ["member", "source", "key"]),

  trayItems: defineTable(trayItemValidator).index("by_member_put_in", ["member", "putInAt"]).index("by_member_put_in_kind", ["member", "putInAt", "kind"]).index("by_pack_kind", ["pack", "kind"]),

  grantRecords: defineTable(grantRecordValidator).index("by_message_recipient", ["message.workspace", "message.conversation", "message.message", "recipient"]),

  grantsTold: defineTable(grantToldValidator).index("by_message", ["message.workspace", "message.conversation", "message.message"]).index("by_workspace_at", ["message.workspace", "at"]),

  thoughtfulTallies: defineTable(thoughtfulTallyValidator).index("by_workspace_week_giver", ["workspace", "week", "giver"]),

  thoughtfulBoardTallies: defineTable(thoughtfulBoardTallyValidator).index("by_workspace_period_giver", ["workspace", "period", "giver"]),

  boardCountedAwards: defineTable(boardCountedAwardValidator).index("by_award", ["award"]),

  questsJudged: defineTable(questsJudgedValidator).index("by_award", ["award"]),

  albumStickers: defineTable(albumStickerValidator).index("by_member_person", ["member", "person"]),

  teamStickers: defineTable(teamStickerValidator).index("by_member_team", ["member", "team"]).index("by_workspace_at", ["workspace", "at"]),

  milestoneTiers: defineTable(milestoneTierRecordValidator).index("by_member_milestone_tier", ["member", "milestone", "tier"]),

  emojiNames: defineTable(emojiNameValidator)
    .index("by_workspace_emoji", ["workspace", "emoji", "person"])
    .index("by_workspace_name", ["workspace", "name"])
    .index("by_emoji", ["emoji", "person", "workspace"]),

  secondEmojiNames: defineTable(secondEmojiNameValidator).index("by_workspace_name", ["workspace", "name"]),

  emojiNameNumbers: defineTable(emojiNameNumberValidator).index("by_workspace_stem", ["workspace", "stem"]),

  seenEmojis: defineTable(seenEmojiValidator).index("by_member_emoji", ["member", "emoji"]).index("by_member_at", ["member", "at"]),

  kudosEmojiPicks: defineTable(kudosEmojiPickValidator).index("by_member_emoji", ["member", "emoji"]),

  emojiClasses: defineTable(emojiClassValidator).index("by_workspace_name", ["workspace", "name"]).index("by_workspace_class", ["workspace", "class", "name"]),

  randomEmojiDrops: defineTable(randomEmojiDropValidator).index("by_member_name", ["member", "name"]),

  albumHistory: defineTable(albumHistoryValidator).index("by_workspace", ["workspace"]),

  pairTallies: defineTable(pairTallyValidator).index("by_member_person", ["member", "person"]),

  weekTallies: defineTable(weekTallyValidator).index("by_member_week", ["member", "week"]),

  weekPeople: defineTable(weekPersonValidator).index("by_member_week_list_person", ["member", "week", "list", "person"]),

  talliedAwards: defineTable(talliedAwardValidator).index("by_award", ["award"]),

  talliedHugs: defineTable(talliedHugValidator).index("by_hug_person", ["hug", "person"]),

  hypeReactions: defineTable(hypeReactionValidator).index("by_giver_at", ["giver", "at"]).index("by_giver_owner_message", ["giver", "owner", "conversation", "message"]).index("by_giver_owner_author", ["giver", "owner", "author"]),

  hypesCollected: defineTable(hypeCollectedValidator).index("by_member_person", ["member", "person"]),

  teamPageCompletions: defineTable(teamPageCompletionValidator).index("by_member_team", ["member", "team"]),

  teamPageChecks: defineTable(teamPageCheckValidator).index("by_member", ["member"]),

  boughtCrates: defineTable(boughtCrateValidator).index("by_member_crate", ["member", "crate"]).index("by_member_n", ["member", "n"]).index("by_member_opened", ["member", "openedAt", "n"]),

  questFinishes: defineTable(questFinishValidator).index("by_member_key", ["member", "key"]),
  questRecognitions: defineTable(questRecognitionValidator).index("by_giver_key", ["giver", "key"]).index("by_giver_day", ["giver", "day"]).index("by_giver_source_at", ["giver", "source", "at"]),
  hugLadders: defineTable({ member: v.id("members"), at: v.number() }).index("by_member", ["member"]),

  effectsBackfill: defineTable({
    before: v.number(),
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),

  memberProgress: defineTable({
    member: v.id("members"),
    xp: v.number(),
    pointsSpent: v.number(),
  }).index("by_member", ["member"]),

  perksOwned: defineTable({
    member: v.id("members"),
    perk: perkValidator,
    boughtAt: v.number(),
    catalogueVersion: v.string(),
  }).index("by_member_perk", ["member", "perk"]),

  perkPurchases: defineTable({
    member: v.id("members"),
    key: v.string(),
    outcome: purchaseOutcomeValidator,
  }).index("by_member_key", ["member", "key"]),

  progressSettings: defineTable({
    member: v.id("members"),
    dms: v.optional(v.boolean()),
    muteNotices: v.optional(v.boolean()),
  }).index("by_member", ["member"]),

  messageSettings: defineTable({
    member: v.id("members"),
    kind: messageKindValidator,
    on: v.boolean(),
    place: v.optional(messagePlaceValidator),
  }).index("by_member_kind", ["member", "kind"]),

  unlocks: defineTable({
    member: v.id("members"),
    feature: featureValidator,
    readyAt: v.number(),
    openedAt: v.optional(v.number()),
  }).index("by_member_feature", ["member", "feature"]),

  unlockLaunches: defineTable({
    workspace: v.string(),
    at: v.number(),
    shipped: v.array(featureValidator),
  }).index("by_workspace", ["workspace"]),

  previewMoments: defineTable({
    member: v.id("members"),
    moment: v.union(v.literal("unlocks"), v.literal("journey")),
    at: v.number(),
  }).index("by_member_moment", ["member", "moment"]),

  levelUps: defineTable({
    member: v.id("members"),
    level: v.number(),
    ready: v.array(featureValidator),
    at: v.number(),
  })
    .index("by_member_level", ["member", "level"])
    .index("by_member", ["member"]),

  homes: defineTable({
    member: v.id("members"),
    tab: v.union(v.literal("profile"), v.literal("settings"), v.literal("admin")),
    version: v.number(),
  }).index("by_member", ["member"]),

  countedKudosGiven: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
  }).index("by_message", ["workspace", "conversation", "message"]),

  countedRecognitions: defineTable({
    workspace: v.string(),
    key: v.string(),
  }).index("by_key", ["workspace", "key"]),

  givenByDay: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    day: v.string(),
    kudos: v.number(),
    kudosReceived: v.optional(v.number()),
    hugsGiven: v.optional(v.number()),
    hugsReceived: v.optional(v.number()),
  })
    .index("by_member_day", ["member", "day"])
    .index("by_workspace_day", ["workspace", "day"]),

  attributedTotals: defineTable({
    workspace: v.string(),
    group: v.id("userGroups"),
    member: v.id("members"),
    period: v.string(),
    kudos: v.number(),
    runningTotal: v.optional(v.array(v.number())),
  })
    .index("by_group_period", ["group", "period"])
    .index("by_member_group_period", ["member", "group", "period"]),

  attributedGroupTotals: defineTable({
    workspace: v.string(),
    group: v.id("userGroups"),
    period: v.string(),
    kudos: v.number(),
    runningTotal: v.optional(v.array(v.number())),
  }).index("by_group_period", ["group", "period"]),

  countedAttributions: defineTable({
    workspace: v.string(),
    conversation: v.string(),
    message: v.string(),
  }).index("by_message", ["workspace", "conversation", "message"]),

  hugRunningTotals: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    period: v.string(),
    runningTotal: v.array(v.number()),
  })
    .index("by_period", ["workspace", "period"])
    .index("by_member_period", ["member", "period"]),

  givenTotals: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    period: v.string(),
    kudos: v.number(),
    kudosReceived: v.optional(v.number()),
    hugsGiven: v.optional(v.number()),
    hugsReceived: v.optional(v.number()),
    firstDay: v.optional(v.string()),
    runningTotal: v.optional(v.array(v.number())),
  })
    .index("by_period", ["workspace", "period"])
    .index("by_member_period", ["member", "period"]),

  mondayPostSettings: defineTable({
    workspace: v.string(),
    on: v.boolean(),
    timeZone: v.string(),
    generation: v.number(),
    nextPostAt: v.optional(v.number()),
    channel: v.optional(v.object({ id: v.string(), name: v.string() })),
    channelCheck: v.optional(v.object({ channel: v.string(), pick: v.number(), outcome: channelCheckValidator })),
  }).index("by_workspace", ["workspace"]),

  mondayPostClaims: defineTable({
    workspace: v.string(),
    week: v.string(),
    claimedAt: v.number(),
    channel: v.string(),
    outcome: mondayPostOutcomeValidator,
  }).index("by_workspace_week", ["workspace", "week"]),

  featuredNewGivers: defineTable({
    workspace: v.string(),
    member: v.id("members"),
    week: v.string(),
    place: v.number(),
  }).index("by_workspace_week", ["workspace", "week"]),

  weekThankers: defineTable({
    member: v.id("members"),
    week: v.string(),
    person: v.id("members"),
  }).index("by_member_week_person", ["member", "week", "person"]),

  leaderboardSettings: defineTable({
    member: v.id("members"),
    visible: v.boolean(),
  }).index("by_member", ["member"]),

  homeSelections: defineTable({
    member: v.id("members"),
    tab: homeTabValidator,
    period: periodValidator,
  }).index("by_member", ["member"]),

  slackRateLimits: defineTable({
    workspace: v.string(),
    method: v.string(),
    until: v.number(),
  }).index("by_method", ["workspace", "method"]),

  analyticsIds: defineTable({
    member: v.id("members"),
    analyticsId: v.string(),
    profileFingerprint: v.optional(v.union(v.string(), v.null())),
    profileUncertain: v.optional(v.boolean()),
  })
    .index("by_member", ["member"])
    .index("by_analytics_id", ["analyticsId"])
    .index("by_profile_fingerprint", ["profileFingerprint"]),

  workspaceKeys: defineTable({
    workspace: v.string(),
    workspaceKey: v.string(),
  }).index("by_workspace", ["workspace"]),

  analyticsOutbox: defineTable({
    uuid: v.string(),
    event: v.string(),
    distinctId: v.string(),
    timestamp: v.number(),
    properties: propertiesValidator,
    exception: v.optional(exceptionValidator),
    person: v.optional(v.object({ set: personPropertiesValidator, unset: v.array(v.string()), fingerprint: v.string() })),
    state: v.union(v.literal("pending"), v.literal("sending"), v.literal("exhausted")),
    failures: v.number(),
    dueAt: v.number(),
    lease: v.optional(v.string()),
    reason: v.optional(v.union(v.literal("rejected"), v.literal("exhausted"), v.literal("expired"))),
  })
    .index("by_state", ["state"])
    .index("by_due", ["state", "dueAt"]),

  recordedFacts: defineTable({
    fact: v.string(),
  }).index("by_fact", ["fact"]),

  analyticsDrain: defineTable({
    job: v.id("_scheduled_functions"),
    generation: v.string(),
  }),

  errorSweep: defineTable({
    cursor: v.number(),
    watchCursor: v.number(),
  }),

  watchedJobs: defineTable({
    job: v.id("_scheduled_functions"),
  }).index("by_job", ["job"]),

  reportedJobs: defineTable({
    job: v.id("_scheduled_functions"),
  }).index("by_job", ["job"]),
  replays: defineTable({
    job: v.id("_scheduled_functions"),
  }).index("by_job", ["job"]),

  flagExposures: defineTable({
    member: v.id("members"),
    flag: v.string(),
    value: v.union(v.string(), v.boolean()),
  }).index("by_member_flag_value", ["member", "flag", "value"]),
  cardPictures: defineTable({
    key: v.string(),
    picture: v.id("_storage"),
  }).index("by_key", ["key"]),
});
