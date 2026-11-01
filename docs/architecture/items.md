# Architecture: items, the retired tray and the last visit

Shaped on ticket 99 of the core-loop map, down the ladder from context to contracts. Round 1 was the product owner's; he accepted its recommendations and handed the remaining rungs to the agent. This file is the interface section of the spec that follows.

## Amended by the core-loop spec

The product owner's calls in the core-loop spec ([spec/core-loop.md](../../spec/core-loop.md)) override this architecture in five places. The spec wins wherever the two differ.

- **LP3.** An item is a sticker or a hoggie. Earned emojis are never items and never hidden: each unlocks with the turn that brings it.
- **LP13.** Milestones stay inline in the turn. Every turn records the milestone tiers it reaches in the same mutation and answers them. They do not move to the bus.
- **LP14.** An emoji unlocks with the turn that brings it, after the item lands.
- **LP15.** No random emojis. The turn never rolls one; the sandbox's old open keeps its roll until the tray retires.
- **LP25.** The level-up reveal page from Silthus/kudos#744 is not shown while `hidden-items` is on, and its flag `level-up-reveal` stays sandbox-only, as `random-emojis` does. The level-up plays in the one flowing sequence instead: the XP moment, the level-up takeover and the item board (LP32, LP34).

The text and the `.mmd` sources below carry these amendments. The rendered images, the HTML pages and their JSON specs in [items/](items/) predate them. Where they differ, the text and the `.mmd` sources win.

## The question

How do the data model and the module contracts change so that every reward a member has not seen lies face down as an item on one item board, the tray and the put-in go dark, the Slack reply spoils nothing, and a last-visit record per member feeds an XP moment within Convex's read limits?

**Premise.** One new module, **Items** (`convex/items`), owns every reward a member has not seen: a sticker or a hoggie. It keeps a ledger with one row per unseen reward, written where the reward is earned. `boardOf` reads that ledger in one index range, and `turn` is the only thing that reveals a row and puts it in the album. A hidden hoggie is drawn at its turn, so face down means "no drop record yet", not a flag every reader must remember. The website and the Slack reply ask Items instead of the album module's pack, tray and put-in functions. A last-visit instant per member lives in Website reads, and the XP moment reads Activity's timeline since it.

## Decisions

Round 1 (accepted by the product owner, 👍):

- **Scope (Q1).** Website app, Website reads, `Feedback` (the album reply), Analytics, Bus, `Album`, `Hoggies`, Unlocks (the level-up hoggies), `Progression` (unchanged), Activity, and the new Items. Quests, the Store and crate store, the quest, feature and bought crates, the Book's stickers and Engine stay out.
- **Actors (Q2).** The giver in Slack earns items; the member on the website turns them and ends or skips the XP moment; PostHog decides the flags and receives the events.
- **Items is its own module (Q3).** `convex/items`, with its own spec. `Feedback` reads only its waiting count.
- **Last visit and the XP moment (Q4).** One forward-only instant per member, kept in Website reads; the XP moment reads Activity through a new lower bound.
- **Analytics (Q5).** `itemTurned` on the bus, projected as `item turned`; `endXpMoment` records `xp moment ended`; a sticker's turn keeps publishing `stickerPutIn`.
- **What deepening pulls in (Q6).** The hoggie drop recorder comes in; the rest was for rung 2.

Rungs 2 to 4 (decided by the agent under the product owner's grant, 🤖; amended by the core-loop spec):

- **A stored ledger, not a derived item board.** One `items` row per unseen reward, written in the same mutation that earns it. The item board and the Slack count are one index range each. An item board derived from packs, the tray and level-ups would read all three on every read, the Slack reply included, and still need a record for level-up hoggies not yet drawn. [ADR-0010](../adr/0010-hidden-items-are-a-ledger-drawn-at-the-turn.md)
- **Two sources (LP3).** An item is a sticker or a hoggie. Earned emojis are never items and never hidden.
- **Earned everywhere, shown where the flag is on.** Writers earn items whatever `hidden-items` says, as packs are recorded whatever `album` says (ADR-0006, ADR-0009). The old reveals (put-in, the level-up drop) mark their items turned, so a member whose flag turns on finds exactly what they have not seen.
- **Drawn at the turn.** A pack's hoggie, a level-up's hoggies and the welcome hoggie get no drop record until their turn. The pack's 15 XP pays at the hoggie's turn through the `applyGain` call the hoggie drop already makes (`convex/hoggies/drops.ts:44-48`). A thanks earns up to two items: the person's sticker (decided at the grant, as today) and the hoggie.
- **No random emoji at the turn (LP15).** The turn never rolls one. The old open keeps its roll (`convex/album/opening.ts:29`) in the sandbox until the tray retires.
- **Emojis unlock with their turn (LP14).** An emoji's unlock is a follow-up of the turn whose item brings it, after the item lands: a team sticker's team emoji, a milestone tier's emoji, and a person's hype emoji at the first item turned from thanking them. A level's emoji unlocks in the level-up takeover, and a thoughtful-giving tier reached in Slack at the member's next turn.
- **The hoggie drop forgets crate kinds** (refactor, this change). `dropFor` takes `waits` from its caller instead of sniffing `thoughtful` (`convex/hoggies/drops.ts:87-89`). The old opening passes `waits: true`; the turn passes nothing.
- **Milestones stay inline (LP13).** Every turn, a sticker's or a hoggie's, records the milestone tiers it reaches in the same mutation and answers them, so their unlock plays in the turn's sequence. The bus's thoughtful `only` filter (`convex/bus/publish.ts:55`) and the put-in's inline calls (`convex/album/putIn.ts:24`, `:32`) stay.
- **One roll** (refactor, this change). `emojiRoll.ts` and `draw.ts` share one SHA-256 fraction helper instead of two copies (`convex/album/emojiRoll.ts:5-12`, `convex/hoggies/draw.ts:28-38`).
- **Reply types from the server** (rule, this change). The website imports every new answer type from `convex/website`; it adds no hand copies to `website/src/album/answer.ts`.
- **Idempotent turns.** A replayed turn answers the same face again and writes nothing, because the Convex client resends a mutation after a reconnect.
- **The old tray rows stay.** A tray item not yet put in is an unturned item; its turn finishes today's put-in (no second XP). Nothing stored is deleted.
- **Two flags.** `hidden-items` (item board, turn, tray and put-in dark, Slack copy) and `xp-moments` (the moment and the last visit), both sandbox-only first, both read without an exposure as `album` is.

## Rung 1: context

![Change map, Target view](items/context-target.png)

The page is [items/context.html](items/context.html); its spec is [items/context.json](items/context.json). Today, Website reads reaches past the album module's seam with 64 symbols from 5 files, and the album reply with 15 symbols from 5 files, only to word the spoiler reply. Seven backend modules (Website reads, `Feedback`, `Hoggies`, Unlocks, Bus, `Progression`, `Album`) form one strongly connected import group.

## Rung 2: modules and seams

![Module page, Target view](items/modules-target.png)

The page is [items/modules.html](items/modules.html), with the views [Target + what it removes](items/modules-removed.png) and [Today](items/modules-today.png). Orange parts are follow-ups.

| Module | Seam after the change | What changes inside |
|---|---|---|
| Items (new) | `earnItem`, `boardOf`, `waitingCountOf`, `turn`, `markTurned` | The `items` ledger; one source each for stickers and hoggies; `fillItems`, the backfill run by hand |
| `Album` | `grantThoughtfulPacks`, `recordPackSticker`, `recordMilestonesOf`, `markEmojisSeenBy`, `shownEarnedEmojiOf` (new) | The grant earns the sticker and the hoggie; the turn records milestone tiers inline and unlocks the emojis it brings; the tray and the put-in go dark |
| `Hoggies` | `dropFor` (takes `waits`), `foundIn`, `putDropIn` (legacy rows only) | No crate-kind sniffing; one shared roll; `trayDrops` read for legacy rows only |
| Unlocks | `dropLevelUpHoggies` | Where it drops three hoggies today, it earns three items while `hidden-items` is on |
| `Progression` | `applyGain` | Unchanged |
| Activity | `activityOf`, `activitySince` (new) | A lower bound on the decided instant |
| Website reads | `getAlbum` (item board), `turnItem`, `getXpMoment`, `endXpMoment` | `lastVisits`; `openThoughtfulPack`, `putIn` and `putAllIn` refuse while `hidden-items` is on |
| `Feedback` | `albumReply` | "An item for thanking X", "N wait" from `waitingCountOf`; no outcome words, no hype picture |
| Bus | `publish` | `itemTurned`; milestones stay off the bus |
| Analytics | | `item turned`, `xp moment ended` |

Dependencies point one way at file level: the album, level-up and reply code that earns or counts items imports `convex/items/ledger.ts`, which imports no album, hoggie or unlock code; only `convex/items/turn.ts` and its sources import them.

## Rung 3: call paths

### The main read: the item board

```mermaid
sequenceDiagram
  participant App as Website app
  participant Web as Website reads
  participant Items
  participant DB as items ledger
  App->>Web: getAlbum()
  Web->>Web: album and hidden-items on, no launch waits
  Web->>Items: boardOf(owner)
  Items->>DB: by_member_turned (member, undefined), oldest first, take 101
  DB-->>Items: at most 101 rows
  Items->>Items: face down: id, earnedAt, reason only
  Items-->>Web: { items: 100 at most, more }
  Web->>Web: name and face once per thanked person
  Web-->>App: AlbumAnswer.board, packs [] and tray []
  Note over App,Web: hidden-items off: board absent, packs and tray as today
```

### The main write: a turn

```mermaid
sequenceDiagram
  participant App as Website app
  participant Web as Website reads
  participant Items
  participant Src as Source (sticker, hoggie)
  participant Hog as Hoggies
  participant Prog as Progression
  participant Alb as Album
  participant Bus
  App->>Web: turnItem(item)
  Web->>Items: turn(owner, item, now)
  Items->>Items: owner's row, flag on, not turned yet
  Items->>Src: reveal(row, at)
  alt hoggie, no drop yet
    Src->>Hog: dropFor(crate, { floor })
    Hog->>Hog: drawOf (pure), drop row, tallies, crest
    Hog->>Prog: applyGain (15 XP, thoughtful only)
    Hog->>Bus: hoggieDropped
    Src->>Src: tallyPackOpened, no emoji roll
  else hoggie in the tray already
    Src->>Hog: putDropIn (no XP, paid at the open)
  else sticker
    Src->>Src: recordPackSticker, tallyNewFace, tray row put in
    Src->>Bus: stickerPutIn
  end
  Src-->>Items: Face
  Items->>Alb: recordMilestonesOf, same mutation
  Alb-->>Items: tiers reached, team sticker, emojis this turn brings
  Items->>Alb: markEmojisSeenBy(unlocked emojis)
  Items->>Items: patch turnedAt
  Items->>Bus: itemTurned
  Items-->>Web: { face, applied, page, unlocked }
  Web-->>App: TurnAnswer
  Bus-->>Bus: later: analytics "item turned"
```

A milestone tier a turn reaches is recorded in the same mutation and answered in `unlocked` with its emoji, so it plays in the turn's sequence after the item lands (LP13, LP19a).

### Failures

```mermaid
sequenceDiagram
  participant App as Website app
  participant Web as Website reads
  participant Items
  participant Src as Source
  App->>Web: turnItem(item), replayed after a reconnect
  Web->>Items: turn(owner, item, now)
  Items->>Items: row.turnedAt is set
  Items->>Src: faceOf(row), reads only
  Src-->>Items: the same face
  Items-->>Web: { kind: "turned", again: true, face }
  Note over Items: no second drop, no second 15 XP, no second event
  App->>Web: turnItem(another member's item, or flag off)
  Web-->>App: { kind: "refused" }, nothing written
  Note over Web,Items: two tabs turning two hoggies at once: both write the member's tallies, Convex retries one on conflict
```

### The XP moment

```mermaid
sequenceDiagram
  participant App as Website app
  participant Web as Website reads
  participant Act as Activity
  participant Items
  App->>Web: getXpMoment()
  Web->>Web: lastVisitOf(member), none: answer "none"
  Web->>Act: activitySince(member, since, most 50)
  Act-->>Web: entries after since, newest first, each with words and XP
  Web->>Items: waitingCountOf(member)
  Web-->>App: { until, excerpts: 5 newest, folded: { count, xp }, climb, waiting }
  App->>App: excerpts float up, XP flies into the bar
  App->>Web: endXpMoment({ until, skipped, shown })
  Web->>Web: moveLastVisit(member, min(until, now)), forward only
  Web-->>App: { kind: "ended" }
  Note over Web: a second tab ending an older until moves nothing
```

The `.mmd` sources and their SVGs are in [items/](items/). The SVGs predate the amendments; the `.mmd` sources carry them.

## Rung 4: contracts

### 1. The ledger (`convex/items/records.ts`, `convex/items/ledger.ts`, new)

```ts
export const itemSourceValidator = v.union(v.literal("sticker"), v.literal("hoggie"));

export const itemReasonValidator = v.union(
  v.object({ kind: v.literal("thanks"), person: v.id("members"), message: messageRefValidator }),
  v.object({ kind: v.literal("levelUp"), level: v.number() }),
  v.object({ kind: v.literal("welcome") }),
);

export const itemValidator = v.object({
  workspace: v.string(),
  member: v.id("members"),
  source: itemSourceValidator,
  key: v.string(), // sticker: the pack ID; hoggie: the crate key (thoughtful:<pack>, level:<n>:<slot>, welcome:first)
  floor: v.optional(rarityValidator), // a level-up's third hoggie (rare), the welcome item (rare)
  reason: itemReasonValidator,
  earnedAt: v.number(),
  turnedAt: v.optional(v.number()),
});

// schema.ts
items: defineTable(itemValidator)
  .index("by_member_turned", ["member", "turnedAt", "earnedAt"])
  .index("by_member_source_key", ["member", "source", "key"]),

export type Earning = Omit<Infer<typeof itemValidator>, "turnedAt">;
export type Reason = Infer<typeof itemReasonValidator>;
export type FaceDown = { item: Id<"items">; earnedAt: number; reason: Reason };

export const mostItemsShown = 100;
export const mostWaitingCounted = 50;

export function earnItem(ctx: MutationCtx, earning: Earning): Promise<Id<"items">>;
export function markTurned(ctx: MutationCtx, member: MemberId, source: ItemSource, key: string, at: number): Promise<void>;
export function boardOf(ctx: QueryCtx, member: MemberId): Promise<{ items: FaceDown[]; more: boolean }>;
export function waitingCountOf(ctx: QueryCtx, member: MemberId): Promise<{ count: number; more: boolean }>;
```

- **Invariants.** An item is earned once per member, source and key: a second `earnItem` returns the first row and moves nothing, so a redelivered event, a retried page and the backfill can overlap. An item turns once, and `turnedAt` never moves. Nothing the item board answers names a face, a person's sticker, a hoggie, a rarity or a source: only the ID, the instant and the reason.
- **Writers.** `grantTo` (`convex/album/packs.ts:85`) earns the sticker (where `holdsSticker`) and the hoggie (`thoughtful:<pack>`), each with reason `thanks`. `dropLevelUpHoggies` (`convex/album/levelUpHoggies.ts:34`), run by `earnLevelUpHoggies` when `levelReached` is published, earns `level:<n>:<slot>` with the third slot's `rare` floor, inside the `level-up-reveal` decision it already takes, and drops nothing while `hidden-items` is on. The welcome item (`welcome:first`, reason `welcome`, a `rare` floor, no XP) is earned when the welcome nudge is sent, and at the member's first sign-in if it is still missing (LP44). No emoji is ever earned as an item.
- **Old reveals.** `putItemIn` and `putEveryItemIn` mark their tray items' sticker and hoggie turned; the level-up drop marks its three hoggies turned. `markTurned` on a missing row does nothing.
- **Errors.** None thrown. `earnItem` on another workspace's member is a programming error the tests catch.
- **Performance.** `boardOf`: one index range, 101 documents at most. `waitingCountOf`: one range, 51 at most, answered as "50+". `earnItem`: one unique lookup and one insert. The grant adds two of each per recipient to its 50-recipient pages.

### 2. The turn (`convex/items/turn.ts`, new; sources in `convex/items/sources/`)

```ts
export type Face =
  | { kind: "sticker"; person: MemberId }
  | { kind: "hoggie"; drop: Drop };

export type Page = { kind: "team"; team: string } | { kind: "people" } | { kind: "hoggies" };

export type Unlock =
  | { kind: "teamSticker"; team: string; emoji: EarnedEmoji }
  | { kind: "milestoneTier"; milestone: MilestoneId; tier: Tier; emoji: EarnedEmoji | null }
  | { kind: "hypeEmoji"; person: MemberId; emoji: EarnedEmoji }
  | { kind: "givingTier"; emoji: EarnedEmoji };

export type Turned = { face: Face; applied: AppliedReward | null; page: Page; unlocked: Unlock[]; again: boolean };

export function turn(ctx: MutationCtx, owner: PageOwner, item: Id<"items">, at: number): Promise<Turned | null>;

type Source = {
  reveal(ctx: MutationCtx, owner: PageOwner, row: Doc<"items">, at: number): Promise<Omit<Turned, "again" | "unlocked">>;
  faceOf(ctx: QueryCtx, owner: PageOwner, row: Doc<"items">): Promise<Omit<Turned, "again" | "unlocked">>;
};
```

- **Answers null** for another member's item, a missing item, or `album` or `hidden-items` off; nothing is written.
- **A turned item** answers `faceOf` with `again: true`, `applied: null` and no `unlocked`, and writes nothing.
- **Hoggie source.** With no drop record it calls `dropFor(ctx, member, crate, at, { surface: "website", floor })`, which draws, counts the hoggie found, records the crest and pays the crate's band (15 XP for `thoughtful`, nothing for `level` or `welcome`); for a pack it then tallies the pack opened. It rolls no random emoji (LP15). With a drop record and a waiting `trayDrops` row it calls `putDropIn` and pays nothing. It leaves `thoughtfulPacks.openedAt` alone, so a flag turned back off shows the pack in the old flow, where the open finds the drop already made.
- **Sticker source.** `recordPackSticker`, `tallyNewFace`, `stickerPutIn` where a sticker is recorded, and a waiting tray row marked put in. The page is the member's first team page holding the person, else the people page.
- **Milestones and emojis, every source (LP13, LP14).** After the reveal, the turn records the milestone tiers it reaches (`recordMilestonesOf`) in the same mutation. It answers in `unlocked`, in play order: the team sticker and its team emoji where a sticker fills a team, each tier reached with its emoji, the person's hype emoji at the first item turned from thanking them, and any thoughtful-giving tier reached in Slack since the last turn. It marks each emoji seen with `markEmojisSeenBy`, so each unlock plays once. None of them is an item.
- **Event.** Every first turn publishes `itemTurned`.
- **Performance.** A hoggie turn costs what an open costs today, minus the random roll's class reads, plus the milestone recount a put-in already pays. A sticker turn costs what a put-in costs.

### 3. The hoggie drop (`convex/hoggies/drops.ts`)

```ts
export type DropContext = { surface?: Surface; floor?: Rarity; waits?: boolean };
export function dropFor(ctx: MutationCtx, member: MemberId, crate: CrateKey, at: number, context: DropContext): Promise<void>;
```

`waits: true` keeps today's tray behaviour for the old opening only (`convex/album/opening.ts:24`). `waitsInTheTray` and its crate-kind check go. `drawOf` stays pure (`convex/hoggies/draw.ts:12-17`), and `emojiRollOf`, which only the old open calls, uses the same fraction helper.

### 4. The website (`convex/website/album.ts`, `convex/website/xpMoment.ts` new)

```ts
export type BoardItem = FaceDown & { thanked: Thanked | null };
export type AlbumAnswer = { /* as today */ board?: { items: BoardItem[]; more: boolean } }; // present while hidden-items is on; packs and tray are then []

export type TurnAnswer = ({ kind: "turned" } & Turned) | { kind: "refused" }; // applied masked by appliedShownTo
export const turnItem = memberMutation({ args: { item: v.id("items") }, handler: /* TurnAnswer */ });

// ActivityEntry: convex/activity/entries.ts:57; Standing: convex/progression/progress.ts:37
export type Excerpt = Extract<ActivityEntry, { kind: "kudosReceived" | "kudosGiven" | "hugReceived" | "hugGiven" | "levelUp" }>;
export type XpMomentRead =
  | { kind: "off" }
  | { kind: "none" }
  | { kind: "moment"; until: number; excerpts: Excerpt[]; folded: { count: number; more: boolean; xp: number }; climb: { from: Standing; to: Standing }; waiting: { count: number; more: boolean } };
export const getXpMoment = memberQuery(/* XpMomentRead */);
export const endXpMoment = memberMutation({ args: { until: v.union(v.number(), v.null()), skipped: v.boolean(), shown: v.number() }, handler: /* { kind: "ended" } | { kind: "refused" } */ });

// lastVisits: defineTable({ member: v.id("members"), at: v.number() }).index("by_member", ["member"])
export function lastVisitOf(ctx: QueryCtx, member: MemberId): Promise<number | null>;
export function moveLastVisit(ctx: MutationCtx, member: MemberId, at: number): Promise<void>;
```

- `openThoughtfulPack`, `putIn` and `putAllIn` answer refused while `hidden-items` is on; the code stays until the flag is everyone's and retired.
- `getXpMoment` answers `none` without a last visit. `endXpMoment` moves the visit to `min(until, now)`, or to now when `until` is null, and never backwards, so two devices agree and a stale tab moves nothing. Entries decided while the moment played stay for the next one, because `until` is the newest decided instant the moment read, not the clock.
- `excerpts` are the five newest entries after the visit, shown oldest first. `folded` counts the rest of what was read, `more` when a source was cut. `climb.from` is the standing at the member's XP minus the moment's XP.
- Every new public function joins `convex/publicSurface.test.ts`.

### 5. Activity (`convex/activity/activity.ts`)

```ts
export function activitySince(ctx: QueryCtx, member: MemberId, { since, most }: { since: number; most: number }): Promise<{ entries: ActivityEntry[]; cut: boolean }>;
```

Each source reads its index from the newest down with `gt("_creationTime", since)`, the implicit last field of every index, taking `most + 1`. That is one range per source and the mention lookups Activity already caps per page. `found` is left out: a turn already shows its find.

### 6. Slack (`convex/feedback/albumReplies.ts`)

While `hidden-items` is on for the giver: each named recipient's headline is "An item for thanking X", with no lines and no hype picture, or for `nextWeek` "Kudos counted." and "Your next item for X comes next week."; one line "N wait" (or "50+ wait") from `waitingCountOf(giver)`, which already counts this grant's items because the grant writes them before it publishes `thoughtfulPacksGranted`; one button, "See your items", to `/book#items`. With the flag off, today's reply stands.

### 7. Analytics

- `itemTurned` `{ workspace, member, source, rarity?, isNew?, at }` on the bus, projected as `item turned` with `source`, `rarity` and `is_new` on the allowlist. `darkFeatures.test.ts` needs a walk that reaches it.
- `xp moment ended` as a usage fact from `endXpMoment`, with `skipped`, `excerpts_shown` and `folded`.

## Members already part-way

`fillItems` (internal, run by hand once per deployment, then again after the flag widens) walks every member one mutation at a time, each scheduling the next, and earns, idempotently: every pack not yet opened (its sticker where it holds one, and its hoggie) and every tray item not yet put in (the tray goes back face down). Level-up hoggies already dropped are already found and earn nothing. Earned emojis earn nothing either: they are never items. A member with more than 100 of one kind carries a cursor to the next mutation. Nothing is deleted, and a rerun earns nothing twice.

## Open items for the spec

- **The lexicon.** Settled by LP1: "item" widens to cover the face-down rewards, and "item board" (not "board", the leaderboard's ranking), "face down", "turn", "last visit" and "XP moment" have entries.
- **Copy for two items per thanks.** The Slack line names the thanks once while the count says how many wait; the website prototype settles the wording.
- **The level-up reveal page** (`level-up-reveal`): settled by LP25. With `hidden-items` on, the level's three hoggies are items on the item board whose reason is `levelUp`, the page is not shown, and `level-up-reveal` stays sandbox-only.
- **Which five excerpts.** The contract says the five newest; the XP moment prototype may prefer the five worth the most XP.

## Follow-ups

- **One earned-emoji set** (to explore). `earnedEmojisOf`, `emojisEarnedBetween`, `levelEmojisEarnedIn` and `isEarnedBy` each rebuild the earned set (`convex/album/earnedEmojis.ts:50`, `:75`, `:87`, `:246`).
- **Tallies as subscribers** (to explore). The pack, face and hoggie tallies are inline calls (`convex/album/putIn.ts:62`, `:68`), while hugs tally through the bus.
- **Break the hoggie ↔ unlock ↔ quest cycle** (to explore). `convex/hoggies/waitingPacks.ts:2-4` imports Quests and Unlocks, which import `convex/hoggies/drops.ts`.
- **Retire the tray** (Strong, after the flag is everyone's). Delete `openThoughtfulPack`, `putIn`, `putAllIn`, the tray UI, the old open's random emoji roll and the `trayDrops` filter in `dropsByDecision`, keeping the rows. It also ends the latent `isNew` drift of tray hoggies, stored at the open from `nextCopyOf` and recounted at the put-in (`convex/hoggies/drops.ts:34`, `:54`); the turn already answers from the recount.
- **One guard for album mutations** (Speculative, not asked). Every handler in `convex/website/album.ts` repeats `albumShownTo`.

## ADRs

- [ADR-0010](../adr/0010-hidden-items-are-a-ledger-drawn-at-the-turn.md): hidden items are a stored ledger, drawn at the turn.
- The last visit on the server was settled on the map and is easy to reverse: no ADR.
- The `waits` option and the shared roll are easy to reverse: no ADR.
