# Items

Items: every reward a member has not seen (LP2, `spec/core-loop.md` on `spec/core-loop`), a thoughtful pack's hoggie and, where the grant decided the pack holds one, the sticker of the pack's person, each earned by the pack's giver for thanking that person, a level up's three hoggies (LP7), the welcome item (LP44), a hoggie for each filled team page and each milestone tier (LP62), and the hoggie of a hoggie forge (HF5, `spec/hoggie-forge.md`). It owns the items `{ workspace, member, source, key, floor?, cap?, weights?, reason, earnedAt, turnedAt? }` (LP4), a hoggie item's floor, cap and named weights stored when it is earned and read by its turn, an item earned with none drawing as it did before caps (HH39, HH42), and while `rarity-caps` is on for the member at the earn, each source's range from the numbers table of `spec/hugs-hook.md`, read through `Hoggies`' `rarityRangeFor` (HH41), unique per member, source and key: `earnItem`, called in the mutation that earns the reward, writes one and answers the first for a second earn, changing nothing, whatever `hidden-items` says (LP5, LP6); the grant of a thoughtful pack earns its giver the pack's hoggie with source `hoggie`, the pack's crate key `thoughtful:{pack ID}` and reason `thanks` naming the thanked person and the message, and where the pack holds a sticker the sticker with source `sticker`, the pack ID as key and the same reason, so a thanks earns one or two items; recording a level up earns its member three hoggie items keyed `level:{level}:1`, `:2` and `:3`, the third with `floor` `rare`, each with reason `levelUp` naming the level, whatever `hidden-items`, `level-up-reveal` or `collection` says, and while `hidden-items` is on for the member the level up drops nothing (LP7). `turnedAt` is set once, by the turn or by `markTurned`, which the album's old open of a thoughtful pack and the old level-up drop, for each crate that dropped, call for the hoggie, and the album's old put-in and put-all-in call for a pack's sticker and a tray hoggie's item, each in their own mutation, so a member whose flag turns on finds only what they have not seen, and it never moves (LP5, LP6). The `hidden-items` flag is a member decision off by default, read without exposure and without writing by `hiddenItemsShownTo`. The item board's read, `boardOf`, reads one index range of the member's items not yet turned, oldest earned first, at most 100 with `more`, each face down as its ID, when it was earned and its reason, never its source, key, face or rarity (LP8, LP9); the website's `getAlbum` answers it while `hidden-items` is on, with the thanked person's name and face, and answers a hype emoji not yet seen as not yet earned while an item thanking its person waits on the board, or while more items wait than the board shows, and the album's `hypeEarnedBy`, for the person's page and the earned emojis Slack counts, holds a hype emoji not yet seen only while an item of the first pack thanking its person still waits face down, through this module's `hypeWaitsForItsItem`, so no emoji moment, page or kudos shows it before the turn that brings it (LP14), and a hype emoji the old put-in earned keeps counting in Slack while a later thanks to the same person waits (LP6); and while `hidden-items` is on it answers a milestone tier whose emoji the member has not seen as not yet earned, its emoji too, and a seen one with `unlockedAt`, the later of its reaching and its emoji's seen mark, and the album's `isEarnedBy`, for the earned emojis Slack counts in kudos and hugs, the kudos emoji picks and the emoji wizard, holds such a tier's emoji the same way through `tierUnlockedAt`, so a tier reached away from the board, such as a thoughtful-giving tier reached in Slack, waits for the next turn before any page, kudos or hug uses its emoji (LP14, LP22). The turn, `turn`, run by the website's `turnItem` while `album`, `hidden-items` and `collection` are on for the member, takes one of the member's own items not yet turned and, in one mutation, for a hoggie draws it through `dropFor` with surface `website` and the item's floor, so a level up's third item never draws below rare, found at once and never waiting in the tray, so the draw stays a pure function of the secret, the member, the crate key and the catalogue version (LP11); and counts the find in the album's tallies, landing on `hoggies` with the pack bonus the drop paid, 15 XP and no coins while `packs` is on; for a sticker runs the album's put-in of the pack sticker, `putStickerIn`, which records it, counts the new face and publishes `stickerPutIn`, pays nothing, lands on the member's first team page holding the person, one the sticker filled before any other, else the person's own page, and unlocks each team page the sticker filled through the album's `unlockReadyTeamsAmong`, its team emoji marked seen (LP13, LP14, LP19); the first item turned from thanking a person unlocks that person's hype emoji, marked seen and answered with the person's name, except a hoggie turned while that person's sticker item waits, which leaves it to the sticker's turn so it unlocks beside the sticker (LP14); every turn records the milestone tiers it reaches (LP13) and, through `unlockMilestoneTiers`, unlocks every tier the member has earned whose emoji they have not seen, those it reached and those reached away from the board, marking each emoji seen so it unlocks once (LP14, LP19a), and while `milestone-xp` is on for the member pays each tier it unlocks XP by its metal through the album's `payTheMedals` (LP19a), marks the item turned and publishes `itemTurned` with its source, a hoggie's drawn rarity, and whether the hoggie or the face is new (LP16); and it answers the face, what it paid, the page it lands on, what it unlocked (the team stickers, the hype emoji, the milestone tiers and, when it paid any, each tier's XP as `medalXp`) and `again` false (LP10). A turned item answers its face again with `again` true, nothing applied and nothing unlocked, writing nothing (LP12); another member's item, a missing one, and a drop that does not land answer nothing. The welcome item (LP44) is a hoggie item with the crate key `welcome:first`, of the `welcome` crate kind, which has no pack band, so its draw stays the same pure function and its turn pays no XP, with a `rare` floor that `dropFor` draws at or above, and reason `welcome`; `earnWelcomeItemOnGreeting`, which follows memberGreeted, earns it, once however often the fact is delivered, from the fact the website's sign-in callback publishes at a member's first sign-in, one Convex Auth links to no account yet, the Slack adapter's verification publishes once users.info verifies a person the directory did not know at their first sign-in (the check that sign-in started carries `firstSignIn`, kept when its tries fail, so a later sign-in's check that verifies them earns it), the welcome nudge publishes when it is sent, and the Monday-path welcome publishes, only where the fact says it owes the welcome item: each publisher decides that once, in its own mutation, through this module's `welcomeItemOwedTo`, true while `welcome-item` and `hidden-items` are both on for the member, read without exposure and without writing by `welcomeItemShownTo` (LP50), and the member holds no welcome item yet, so a member who signed in before the flag earns none, the follower never decides the flags a second time, and nothing expires it; `shownWaitingHoggiesAtTheWelcomeOf` counts it among the waiting hoggies while the Monday-path welcome owed it and it is not yet earned, so that welcome counts it once whether it is read before or after the follower earns it, and never counts an item it did not owe. `lessonAfter` answers, for the first turn of the welcome item while both flags are on, the workspace's kudos emoji and its custom picture or null, for the one line that teaches the loop (LP49), and nothing for a replay or any other item. `newestTurnOf` answers the instant of the member's newest turn from one index range, or none, for Website reads' last visit (LP26). A tray item the album's old open put in the tray and the old put-in has not put in waits face down (LP23): beside each tray item it writes, the old open earns its item with the pack's reason and earning instant, for a sticker the pack's sticker item and for a hoggie a hoggie item keyed `tray:{tray item ID}`, and it puts in the tray only what is not yet turned, so a pack whose items turned while `hidden-items` was on opens into an empty tray with nothing applied; the turn of a tray hoggie item finishes the old put-in of its tray item from the drop the open recorded, through the album's `placeFromTheTray`, landing on `hoggies` and paying nothing, and a sticker's turn marks its pack's waiting tray sticker put in. While `hidden-items` is on for the member, the website's `openThoughtfulPack`, `putIn` and `putAllIn` refuse and write nothing; their code stays until the flag is everyone's. `fillItems` (LP24), an internal mutation run by hand once per deployment, again after the flag widens and again after it goes back off, walks every member in creation order, one member a mutation, and earns, at most 100 of a kind a mutation with the next scheduled from its cursor, each pack the member has not opened its items as the grant does, and each tray item not yet put in its item as the open does; then it reads the member's items not yet turned, at most 100 a mutation, and for each level they name runs the level up's own `dropLevelUpHoggies` again at the instant its items were earned, which earns nothing new and, while `hidden-items` is off for the member and the old level-up drop decides to drop, draws the three hoggies and marks their items turned, whichever flag kept them waiting, so they reach the old reveal once, pay nothing, and wait on no board once the flag turns on again (LP6); `earnItem` and the drop's own record make a rerun earn and drop nothing, and it deletes nothing. Achievement hoggies (LP62 to LP65): the album's team sticker unlock, `insertTeamSticker`, earns its member, through `earnTeamItem` in its mutation, a hoggie item keyed `team:{team}` with reason `team` naming the team and its name and a `rare` floor, and the album's tier record, `recordTiersOf`, earns through `earnTierItem` for each tier it records a hoggie item keyed `milestone:{milestone}:{tier}` with reason `milestone` and a floor of `uncommon` for bronze, `rare` for silver, `epic` for gold and `legendary` for diamond, whatever `hidden-items` or `achievement-hoggies` says; the `team` and `milestone` crate kinds have no pack band, so their turn pays no XP. The turn of a team or tier item hands `dropFor` `unowned`, so the draw, still a pure function of the secret, the member, the crate key, the catalogue version, the floor and now the hoggies the member owns at the turn, picks among the rarities at or above the floor that still hold a hoggie the member does not own, by the usual weights, and among those hoggies; when the member owns every hoggie at or above the floor it is the plain floor draw, a duplicate at or above it (LP64); every other draw is unchanged (LP63). `achievementHoggiesShownTo` reads `achievement-hoggies`, a member decision off by default, without exposure and without writing, and `hidden-items`; while either is off the ledger's waiting read leaves team and tier items out, so the board, the waiting count and every reply or teaser built on it never show them, and the turn refuses them, so they wait undrawn and nothing is lost when a flag turns back off (LP65). The board names a team item by its team's name and a tier item by its medal. A Monday-path quest's finish earns its member, through `earnQuestHoggie`, which follows questFinished, a hoggie item keyed `quest:{reward key}` with reason `quest` naming the quest, once however often the fact is delivered, and nothing for a finish without a reward key, as the unlock path publishes it, or for a member who left (HH24). A hug given whose hugGiven says `rewards` (HH34) earns its giver, through `findOnHug`, which follows hugGiven, a hug find with the chance the numbers table sets, 20%, decided from the hug's own conversation and message by the deployment's draw secret, so a replay decides the same: a hoggie item keyed `hug-find:{day}` of the giver's day, its crate kind `hug-find`, with reason `hug`, always stored capped at rare with `base` weights whatever `rarity-caps` says, so its turn draws common to rare and pays no XP or coins; the key makes a second find that day return the first, so a giver finds at most once a day and a redelivered fact earns nothing more, and a fact without `rewards`, from before, or a giver who left earns nothing (HH35, HH36). A hoggie forge (HF5, HF6) earns, through `earnItem` in `forgeHoggie`'s mutation, a hoggie item keyed `forge:{request}` with reason `forge` naming the hoggie forged from, whatever any flag says, and the board names it by that hoggie; its turn hands the hoggies module's `dropForged` the item's crate key and that hoggie instead of `dropFor`, which draws among the hoggies one rarity above it the member does not own at the turn, or among every hoggie of that rarity when they own them all, by the same pure function, and records it through `recordFind`; the `forge` crate kind has no pack band, so the turn pays no XP. Only this module's `earnItem` writes items.

## invariants
- an item is earned once per member, source and key: A kudos earns its giver exactly one item for each pack it grants, whatever `hidden-items` says, and an earn of the same member, source and key again, from a redelivered event or any other writer, adds nothing; an item earned while the flag is off waits on the item board once it turns on.
  over: a thoughtful kudos and the same Slack event redelivered, read on the giver's item board with hidden-items on; a thoughtful kudos given while hidden-items is off, read on the board once it turns on
  via: LP5 LP7: a thanks in Slack earns its pack's hoggie as one item
  because: every writer of an item earns it where the reward is decided and the backfill and retried pages overlap them (LP5), so a second earn that added a row would put one hoggie on the board twice and pay its band twice; and an item earned only while the flag is on would leave a member whose flag turns on without the packs they earned before (LP6)
  refuted: the grant earned each pack's hoggie twice and earnItem no longer looked up the member's earlier item of that source and key -> 2 of 2 tests failed: one thoughtful kudos put two items on the board, and the item earned while hidden-items was off waited twice (2026-10-21)
  kinds: storage, state
  checklist: scoped-reads dismissed: the invariant is about what is written; the board's read is the item board names only when and whom
  checklist: revalidated-permission dismissed: earning an item needs no permission; the awards the grant follows were decided when they were given
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: earnItem takes only internal arguments, checked by the grant's kudosGiven validator and the items table's validator
  checklist: revision-preservation dismissed: an item is never revised; it is inserted once and only its turnedAt is set, once
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: no late write displaces an item; a second earn finds the first by its member, source and key and writes nothing, and Convex retries a mutation whose read of that range changed before it committed
  checklist: worker-fencing dismissed: no worker owns an item; two earns of one key conflict on the range they both read, so one retries and finds the other's
  checklist: commit-ordered-effects dismissed: earning an item issues no external effect
  checklist: durable-dispatch-intent dismissed: the item is earned in the grant's own mutation, beside the pack it is keyed by, so it commits with its cause or not at all
  checklist: resumption-coverage dismissed: the grant's pages and their resumption are the album's a message's packs are told once; each page earns the items of the packs it grants
  checklist: declared-target-coverage dismissed: the only writer in this slice is the thoughtful pack grant, reached by the oracle through kudos given at the Slack boundary
  checklist: completion-evidence dismissed: nothing waits on an item's earn; the board reads the stored items
- the item board names only when and whom: While `hidden-items` is on for the member, getAlbum answers the item board of their own items not yet turned, oldest earned first, at most 100 with `more` past them, each naming only its ID, when it was earned and whom it thanked, never a face it holds, a rarity or a source, and answers no packs and no tray beside it.
  over: two thoughtful kudos to two people read on the board in earning order, every board item's keys, and 101 waiting items over two messages, read through getAlbum with album, collection, packs and hidden-items on
  via: LP8 LP9 LP17: with hidden-items on, getAlbum answers the item board and no packs or tray
  because: the board is the face-down moment of the core loop (LP9): an item that named its source or rarity would give the surprise away before the turn, and packs or a tray beside the board would show the same reward twice (LP17); the read stays one range of at most 101 rows however many items wait (LP8)
  refuted: boardOf's face-down item also carried the item's source -> 1 of 2 tests failed: a board item's keys were earnedAt, item, reason and source instead of only the first three (2026-10-21)
  kinds: read, output
  checklist: scoped-reads dismissed: the board reads only the signed-in member's own items by an equality on the member, under the website's memberQuery guard; the album is private covers reading across members
  checklist: destination-confinement dismissed: the board goes only to the signed-in browser that asked; nothing is sent elsewhere
  checklist: redaction declared as the item board names only when and whom
  checklist: commit-ordered-effects dismissed: the board is a query; it writes nothing and issues no effect
  checklist: circuit-breaker-policy dismissed: no breaker is declared; nothing is sent
  checklist: declared-target-coverage dismissed: getAlbum is the only read of the board
- a turn draws the hoggie and pays once: The first turn of a member's own item draws its hoggie at the turn, found at once, pays the pack's 15 XP, takes the item off the board and sends one item turned naming its source, rarity and whether it is new.
  over: one thoughtful kudos with every album flag on, its item turned through turnItem, read through getAlbum's level and board, getAlbumHoggies' found hoggies, the draw for the pack's crate key and the item turned events PostHog receives
  via: LP10 LP11 LP16: turnItem draws the hoggie at the turn, pays the pack's 15 XP and sends item turned
  because: a hoggie item has no drop until its turn (LP11), so a turn that left the drop waiting in the tray would answer a hoggie the member never finds, and a turn that paid nothing or sent nothing would lose the pack's XP and the core loop's measure (LP16)
  refuted: the turn passed waits true to dropFor, so its drop waited in the tray -> 1 of 1 tests failed: getAlbumHoggies found no hoggie after the turn instead of the drawn one (2026-10-21)
  kinds: state
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: separation-of-duties dismissed: no approval policy; a member turns their own item with one click
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: turnedAt is set once and never moved, and Convex retries a turn whose read of the item or its drop changed before it committed
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: commit-ordered-effects dismissed: itemTurned is published in the turn's mutation, and the bus schedules its subscribers only when that mutation commits
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- a replayed turn applies nothing: Turning an item already turned answers the same face with `again`, pays nothing, drops nothing and sends nothing more, and two items turned at once both land.
  over: one item turned twice, read as the second answer beside the first, the member's XP and the item turned and hoggie dropped events PostHog receives; two items turned concurrently, read on the board
  via: LP12: a replayed turn answers the same face and applies nothing
  because: the Convex client resends a mutation after a reconnect (LP12), so a replay that paid or published again would double the pack's XP and count one turn twice
  refuted: the turn no longer checked turnedAt, so a turned item was turned again -> 1 of 2 tests failed: the second turn answered again false with the bonus applied instead of again true and nothing applied (2026-10-21)
  kinds: state, message
  checklist: revalidated-permission dismissed: a replay reads the flags, the session and the item's owner again in its own mutation
  checklist: destination-confinement dismissed: itemTurned goes only to the subscribers the bus registers; Analytics' outbox posts only to the configured POSTHOG_HOST
  checklist: message-authenticity dismissed: the turn's input is the browser's item ID, checked against the signed-in member's own items by the turn refuses and writes nothing
  checklist: input-validation dismissed: turnItem's argument is checked by its v.id validator, and the fact by its own event validator
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: a turn that finds the item turned answers its stored drop and writes nothing, and Convex retries a mutation whose read of the item changed before it committed
  checklist: retry-recognition declared as a replayed turn applies nothing
  checklist: duplicate-suppression declared as a replayed turn applies nothing
  checklist: keyed-ordering dismissed: the fact carries the turn's instant, and PostHog orders events by it, not by delivery
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read
  checklist: acknowledgment-barrier dismissed: the answer goes back to the browser only when the turn's mutation commits
  checklist: commit-ordered-effects dismissed: itemTurned is published in the turn's mutation, and the bus schedules its subscribers only when that mutation commits
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
  checklist: retry-classification dismissed: nothing is sent here; the drain classifies PostHog's answers
- the turn refuses and writes nothing: turnItem refuses another member's item, a missing item, and any item while `hidden-items`, `album` or `collection` is off for the member, and writes nothing then; the same item turns once the flag is back.
  over: another member's item, an item deleted before its turn, and an item turned with hidden-items off, with album off and with collection off, each read through every table and every scheduled function before and after, then turned with every flag back on
  via: LP10: turnItem refuses and writes nothing
  because: an item ID reaches the browser, so a turn that accepted another member's ID would reveal and take their reward, and a turn while the flags are off would show a dark feature (LP10)
  refuted: the turn checked only that the item exists, never that it is the signed-in member's own -> 1 of 4 tests failed: another member's item answered turned instead of refused (2026-10-21)
  refuted: turnItem no longer read hidden-items before turning -> 1 of 4 tests failed: with hidden-items off the turn answered turned instead of refused (2026-10-21)
  refuted: turnItem no longer read collection before turning -> 1 of 18 tests failed: with collection off the turn answered turned instead of refused (2026-10-21)
  crossing: browser -> domain
  entrances: mutation turnItem
  kinds: identity, state
  checklist: capability-authorization dismissed: the session token authorizes only acting as the signed-in member, rechecked by the website's memberMutation guard on every call; the item ID grants nothing by itself
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it
  checklist: canonical-encoding dismissed: the item is named by its Convex document ID, compared as the validator parsed it, and its owner by the member ID the session resolved
  checklist: identity-continuity dismissed: an item belongs to one member for its whole life; a turn by anyone else is refused
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession dismissed: a refusal moves no state
  checklist: supersession-safety dismissed: a refusal writes nothing, so nothing late can publish a different value
  checklist: worker-fencing dismissed: no worker runs the turn; each call is one mutation
  checklist: commit-ordered-effects dismissed: a refusal issues no effect and schedules nothing
  checklist: resumption-coverage dismissed: no batch operation resumes
- the old open marks its item turned: With `hidden-items` off, getAlbum answers no item board and the album's open of a thoughtful pack opens it into the tray as before, and marks the pack's hoggie item turned, so the opened pack's item no longer waits once the flag turns on.
  over: one thoughtful kudos with hidden-items off, read through getAlbum, opened through openThoughtfulPack, then read on the board once hidden-items turns on
  via: LP6: with hidden-items off, packs, the tray and the open stay as today, and the open marks the item turned
  because: the flag can go either way (LP6): an open that left its item waiting would show a member whose flag turns on a hoggie they already opened, and turning it would draw the same hoggie again
  refuted: openThoughtfulPack no longer marked the pack's hoggie item turned -> 1 of 1 tests failed: once hidden-items turned on, the opened pack's item still waited on the board (2026-10-21)
  kinds: state
  checklist: revalidated-permission dismissed: the open reads the pack's giver and the flags in its own mutation, as the album's open of a thoughtful pack does
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as the old open marks its item turned
  checklist: supersession-safety dismissed: markTurned sets turnedAt only on an item not yet turned, so a later turn or open moves nothing
  checklist: worker-fencing dismissed: no worker owns an item; an open and a turn of one item conflict on the row they both read, so one retries and finds it turned
  checklist: commit-ordered-effects dismissed: marking the item turned issues no external effect
  checklist: resumption-coverage dismissed: no batch operation resumes; each open is one mutation
- a thanks earns its hoggie and, where its pack holds one, its sticker: A kudos earns its giver, for each pack it grants, the pack's hoggie and, when the grant decided the pack holds the person's sticker, that sticker as a second item, each once per member, source and key; a pack whose person's sticker already waits earns only its hoggie.
  over: one thoughtful kudos to a new face and the same Slack event redelivered, and a second thanks to that person the next week while their sticker waits, read through the giver's stored items
  via: LP7: a thanks earns its hoggie and, where the pack holds one, the person's sticker
  because: the sticker is the other half of what a thanks brings (LP7): a grant that earned no sticker item would leave the person out of the album while the old open is dark, and one that earned it for a pack holding none would put a face in the album twice
  refuted: the grant earned the sticker item for every pack, whether or not it holds a sticker -> 1 of 2 tests failed: a thanks whose person's sticker already waited earned a second sticker item beside its hoggie (2026-10-21)
  kinds: storage, state
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: a second earn finds the first by its member, source and key and writes nothing
  checklist: commit-ordered-effects dismissed: earning an item issues no external effect
  checklist: durable-dispatch-intent dismissed: the items are earned in the grant's own mutation, beside the pack they are keyed by
  checklist: declared-target-coverage dismissed: the thoughtful pack grant is the only writer of a sticker item, reached by the oracle through kudos given at the Slack boundary
  checklist: scoped-reads dismissed: the earn reads only the giver's own items by an equality on the member
  checklist: revalidated-permission dismissed: earning an item needs no permission; the awards the grant follows were decided when they were given
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: earnItem takes only internal arguments, checked by the grant's kudosGiven validator and the items table's validator
  checklist: revision-preservation dismissed: an item is never revised; it is inserted once and only its turnedAt is set, once
  checklist: separation-of-duties dismissed: no approval policy
  checklist: worker-fencing dismissed: no worker owns an item; two earns of one key conflict on the range they both read, so one retries and finds the other's
  checklist: resumption-coverage dismissed: the grant's pages and their resumption are the album's a message's packs are told once; each page earns the items of the packs it grants
  checklist: completion-evidence dismissed: nothing waits on an item's earn; the board reads the stored items
- a sticker's turn is today's put-in: The first turn of a member's own sticker item puts the person in their album once, sends one album sticker collected and one item turned with source sticker, no rarity and is_new, pays nothing and answers the person's first team page, else their own page; a replay answers the same face and changes nothing.
  over: a thoughtful kudos to a person on a team page and one to a person on none, their sticker items turned through turnItem, read through getAlbum's people, every table and scheduled function before and after a replay, and the item turned and album sticker collected events PostHog receives
  via: LP13: a sticker's turn is today's put-in
  because: the turn replaces the put-in while hidden-items is on (LP13, LP23): a turn that skipped the put-in's tally or its stickerPutIn would break album sticker collected's series, and one that landed nowhere would leave the member looking for the face they just turned
  refuted: putStickerIn no longer published stickerPutIn -> 1 of 2 tests failed: the sticker's turn sent no album sticker collected (2026-10-21)
  kinds: state, message
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: recordPackSticker writes a person's album sticker once, and turnedAt is set once
  checklist: commit-ordered-effects dismissed: stickerPutIn and itemTurned are published in the turn's mutation, and the bus schedules their subscribers only when it commits
  checklist: retry-recognition declared as a replayed turn applies nothing
  checklist: duplicate-suppression declared as a replayed turn applies nothing
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: destination-confinement dismissed: stickerPutIn and itemTurned go only to the subscribers the bus registers; Analytics' outbox posts only to the configured POSTHOG_HOST
  checklist: message-authenticity dismissed: the turn's input is the browser's item ID, checked against the signed-in member's own items by the turn refuses and writes nothing
  checklist: input-validation dismissed: turnItem's argument is checked by its v.id validator, and each fact by its own event validator
  checklist: separation-of-duties dismissed: no approval policy
  checklist: keyed-ordering dismissed: the facts carry the turn's instant, and PostHog orders events by it, not by delivery
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: acknowledgment-barrier dismissed: the answer goes back to the browser only when the turn's mutation commits
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
  checklist: retry-classification dismissed: nothing is sent here; the drain classifies PostHog's answers
- a filled team unlocks with the turn that fills it: The turn of the sticker that fills the last place on a team page answers that team, unlocks its team sticker with its team emoji marked seen in the same mutation, and a replay changes nothing.
  over: a thoughtful kudos to the two other people on a member's team, their stickers turned one after the other, then the second turned again, read through the answers, getAlbum's teams and emojis, and every table and scheduled function before and after the replay
  via: LP14 LP19: a sticker that fills a team unlocks its team sticker and team emoji on that page
  because: emojis unlock with the turn that brings them (LP14): a filled page left ready would wait for a click the core loop no longer offers, and a team emoji left unseen would play again in the arrival's emoji moment
  refuted: unlockReadyTeamsAmong unlocked the team sticker without marking its team emoji seen -> 1 of 1 tests failed: the team emoji read unseen after the turn that filled its team (2026-10-21)
  kinds: state
  checklist: legal-state-succession declared as a filled team unlocks with the turn that fills it
  checklist: supersession-safety dismissed: only a page that reads ready unlocks, and an unlocked page never reads ready again
  checklist: commit-ordered-effects dismissed: the unlock issues no external effect
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: separation-of-duties dismissed: no approval policy
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- a hype emoji unlocks with its person's first item turned: While `hidden-items` is on, a hype emoji not yet seen reads unearned in getAlbum while an item thanking its person waits, and on getAlbumPerson's page and to the earned-emoji check that lets it count in Slack while an item of the first pack thanking its person waits, so one the old put-in earned keeps counting while a later thanks waits; a hoggie turned while that person's sticker item still waits answers none and leaves it waiting, so it unlocks beside the sticker; otherwise the first item turned from thanking the person answers the emoji with the person's name and marks it seen, and a later item for that person answers none; with the flag off the hype emoji is earned and unseen from the thanks, on the person's page and in Slack, as before.
  over: one thoughtful kudos read through getAlbum's emojis before its items turn, its hoggie item then its sticker item turned; a thanks whose pack holds no sticker because the album's history holds the person, its hoggie turned; the person's page read and a kudos with the hype emoji posted through the signed Slack boundary before and after the sticker turns; and the same kudos with hidden-items off, read on the album, the person's page and in Slack; and a thanks put in through the old flow, then a later thanks to the same person waiting once hidden-items is on, with the person's page read and a kudos with the hype emoji posted
  via: LP14: the first item turned from thanking a person unlocks their hype emoji once
  because: an emoji shown before its item turned would give the item away and play its unlock twice (LP14), and the flag can go either way, so the old flow keeps its hype emoji (LP6)
  refuted: isHeldForItsItem held no hype emoji, so getAlbum answered it earned while its item waited -> 1 of 2 tests failed: the hype emoji read earned before any item thanking its person turned (2026-10-21)
  refuted: a hoggie's turn unlocked the thanked person's hype emoji while that person's sticker item still waited face down -> 1 of 4 tests failed: the hoggie's turn answered the hype the sticker's turn should bring (2026-10-21)
  refuted: the person page and Slack's earned-emoji check counted a packed person's hype emoji earned while its thanks item still waited face down -> 1 of 4 tests failed: the person page read the hype emoji earned and Slack counted it before its item turned (2026-10-21)
  refuted: hypeEarnedBy held every unseen hype emoji of a packed person, whether or not its first pack still waited face down -> 1 of 5 tests failed: a hype emoji the old put-in earned read unearned on the person's page and gave no kudos in Slack while a later thanks waited (2026-10-21)
  kinds: read, state
  checklist: legal-state-succession dismissed: a seen emoji stays seen; the hold reads the board and the seen rows fresh
  checklist: supersession-safety dismissed: the turn writes the emoji's seen row once, in the mutation that turns the item
  checklist: redaction dismissed: the hold only withholds a reward until its turn; it names nothing more
  checklist: commit-ordered-effects dismissed: marking an emoji seen issues no external effect
  checklist: scoped-reads dismissed: getAlbum reads only the signed-in member's own board and seen emojis by an equality on the member, under the website's memberQuery guard
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: separation-of-duties dismissed: no approval policy
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- every turn answers the milestone tiers it unlocks: A turn, a hoggie's or a sticker's, answers exactly the milestone tiers it recorded in its own mutation, the teams tier among them when it filled a team, and before them every tier reached away from the board whose emoji the member has not seen, such as the thoughtful-giving tier its thanks reached in Slack.
  over: a thoughtful kudos to the two other people on a member's team, which reaches the first thoughtful tier in Slack, a hoggie item turned, then both sticker items, read through the answers and the milestone tiers stored at each turn's instant
  via: LP13 LP14: every turn answers the milestone tiers it unlocks
  because: milestones stay inline in the turn so their unlock plays in its sequence (LP13, LP19a): a turn that recorded a tier without answering it would leave the beat with nothing to play, and a thoughtful-giving tier reached in Slack plays as a follow-up of the next turn (LP14)
  refuted: the turn answered every tier it recorded but the first -> 1 of 1 tests failed: a turn's answer missed a tier stored at its instant (2026-10-21)
  refuted: unlockMilestoneTiers answered only the tiers recordMilestonesOf wrote in the turn -> 1 of 1 tests failed: the hoggie's turn answered no tier instead of the thoughtful tier its thanks reached in Slack (2026-10-21)
  kinds: state, output
  checklist: legal-state-succession dismissed: the turn records each tier once through the album's recordMilestonesOf and answers a tier only while its emoji's seen mark is missing, writing that mark in the same mutation
  checklist: commit-ordered-effects dismissed: recording a tier issues no external effect
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: destination-confinement dismissed: stickerPutIn and itemTurned go only to the subscribers the bus registers; Analytics' outbox posts only to the configured POSTHOG_HOST
  checklist: redaction dismissed: the answer names only what the member's own turn unlocked
  checklist: separation-of-duties dismissed: no approval policy
  checklist: supersession-safety dismissed: turnedAt is set once and never moves, and Convex retries a turn whose reads changed before it committed
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
  checklist: circuit-breaker-policy dismissed: no breaker is declared; nothing is sent
  checklist: declared-target-coverage dismissed: turnItem is the only mutation that turns an item, reached by the oracle through a signed-in website session
- a medal unlocked by a turn pays XP by its metal: While `milestone-xp` is on for the member, the turn that unlocks a milestone tier answers it in `medalXp` with its XP, 100 for bronze, 250 for silver, 500 for gold and 1,000 for diamond, and publishes `medalUnlocked` for it, which Progression records once under `milestone:{milestone}:{tier}`, so a replay or a redelivered fact pays nothing more; with the flag off it answers no `medalXp` and pays nothing, and a tier unlocked before the flag pays nothing later.
  over: a sticker item turned that unlocks the first people tier with the flag on, its XP read before and after the scheduled payment and after a replay; silver, gold and diamond tiers paid through payTheMedals, their reward records read by key; the same turn with the flag off
  via: LP19a: a medal unlocked by a turn pays XP by its metal
  refuted: payTheMedals answered the medals' XP without publishing medalUnlocked -> 2 of 3 tests failed: the member's XP stayed at the item's pack bonus and no reward record was written under the tier's key (2026-11-04)
  because: the product owner asked that a medal pay massive XP, more the harder its tier, added at the end of its beat (LP19a); paying through a bus fact keeps the album from writing progression, and the reward key keeps a tier from paying twice
  kinds: state, output
  checklist: legal-state-succession dismissed: the reward record is insert-only and keyed by the tier, so a tier pays once
  checklist: supersession-safety dismissed: the fact is published in the turn's own mutation, once per tier its emoji's seen mark lets it unlock, and recordReward writes nothing for a key it holds
  checklist: commit-ordered-effects dismissed: publishing the fact schedules Progression's mutation in the turn's transaction, so it commits with the turn or not at all
  checklist: durable-dispatch-intent dismissed: the bus schedules the payment in the publisher's transaction
  checklist: revalidated-permission dismissed: the flag, the session and the item's owner are read in the same mutation that turns it
  checklist: scoped-reads dismissed: the turn reads only the member's own tiers and emojis' seen rows
  checklist: separation-of-duties dismissed: no approval policy
  checklist: worker-fencing dismissed: no worker owns a tier; two turns conflict on the seen row they both read, so one retries and unlocks nothing
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
  checklist: circuit-breaker-policy dismissed: no breaker is declared; nothing is sent outside Convex
  checklist: declared-target-coverage dismissed: unlockMilestoneTiers, run only by the turn, is the only caller of payTheMedals
  checklist: destination-confinement dismissed: medalUnlocked goes only to the subscriber the bus registers, Progression's payMedalUnlocked
  checklist: redaction dismissed: the fact and the answer name only the member's own tier and its XP
- a milestone tier unlocks once, in the turn that brings it: While `hidden-items` is on, getAlbum answers a milestone tier the member reached but whose emoji they have not seen as not yet earned, with its emoji unearned, so no emoji moment shows it; the turn that unlocks it answers it once and marks its emoji seen, and getAlbum then answers it earned from its reaching with `unlockedAt` at the turn; with the flag off a tier is earned with its emoji unseen from its reaching, as before.
  over: a sticker item turned that reaches the first people tier and its replay; a thoughtful kudos whose first thoughtful tier waits through getAlbum before the giver's next turn, that turn and the one after it; the same kudos with hidden-items off
  via: LP14 LP19a: each milestone tier unlocks once, in the turn that brings it
  because: each unlock plays once, wherever it plays first, and marks its emoji seen (LP14): a tier answered earned before its turn would pop its emoji over the landed page before its beat, which #104 saw with the first people tier, and a tier answered by two turns would play its beat twice; the flag can go either way, so the old flow keeps its emoji moment (LP6)
  refuted: milestonesHeldForTheirTurn answered getAlbum's milestones unchanged -> 2 of 3 tests failed: the thoughtful tier read earned before the giver's next turn, and a tier the turn unlocked read no unlockedAt (2026-10-21)
  kinds: read, state
  checklist: legal-state-succession dismissed: a seen emoji stays seen; the hold reads the stored tiers and their emojis' seen rows fresh on every read
  checklist: supersession-safety dismissed: the turn writes each tier emoji's seen row once, in the mutation that turns the item, and Convex retries a turn whose read of that row changed before it committed
  checklist: redaction dismissed: the hold only withholds a medal until its turn; it names nothing more
  checklist: commit-ordered-effects dismissed: marking an emoji seen issues no external effect
  checklist: scoped-reads dismissed: getAlbum reads only the signed-in member's own tiers and seen emojis by an equality on the member, under the website's memberQuery guard
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: separation-of-duties dismissed: no approval policy
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- the old put-in marks its sticker item turned: With `hidden-items` off, the album's put-in and put-all-in put a pack's sticker in as before and mark its sticker item turned, so once the flag turns on only the stickers not put in wait.
  over: one thoughtful kudos to two people, both packs opened with hidden-items off, one sticker put in, read on the board once hidden-items turns on, then the rest put all in and read again
  via: LP6: the old put-in and put-all-in mark the sticker item turned
  because: the flag can go either way (LP6): a put-in that left its item waiting would show a member whose flag turns on a face already in their album
  refuted: the album's put-in no longer marked the sticker item turned -> 1 of 1 tests failed: a sticker put in with hidden-items off still waited on the board once the flag turned on (2026-10-21)
  kinds: state
  checklist: legal-state-succession declared as the old open marks its item turned
  checklist: supersession-safety dismissed: markTurned sets turnedAt only on an item not yet turned
  checklist: commit-ordered-effects dismissed: marking the item turned issues no external effect
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it, so no permission is carried from an earlier check
  checklist: separation-of-duties dismissed: no approval policy
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read, so one retries and finds it turned
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- a level up earns its three hoggies as items: Recording a level up earns its member three hoggie items keyed by the level's slots `level:{level}:1`, `:2` and `:3`, the third with a rare floor, each with reason `levelUp` naming the level and shown on the item board with that level, once per member, source and key, whatever `hidden-items` says; while `hidden-items` is on the level up drops nothing, and while it is off the old drop stands and marks the item of each crate it dropped turned, so a member whose flag turns on finds only the level items they have not seen.
  over: a kudos in Slack that takes its giver to level 2 with hidden-items on, read through the stored items, getAlbum's board, the drop records and getAlbumHoggies; level ups at 2 and 3 with 3 replayed; the same kudos with hidden-items off, and with hidden-items and level-up-reveal off, read on the board once hidden-items turns on
  via: LP6 LP7: a level up earns its three hoggies as items
  refuted: earnLevelUpItems no longer gave the third item its rare floor -> 1 of 4 tests failed: the giver's stored level:2:3 item had no floor (2026-10-21)
  refuted: the old level-up drop no longer marked its items turned -> 1 of 4 tests failed: with hidden-items off, the three dropped items still waited on the board once it turned on (2026-10-21)
  because: a level up's three hoggies are a reward the member has not seen until they turn it (LP7, LP32), so a level up that dropped them while the board is on would show the same reward twice, one that earned no items would leave the level's hoggies off the board, and an item left waiting after the old drop showed its hoggie would draw it a second time once the flag turns on (LP6)
  kinds: storage, state
  checklist: scoped-reads dismissed: the items are the member's own, written for the member the level up names
  checklist: revalidated-permission dismissed: nothing is queued; hidden-items and level-up-reveal are read in the mutation that records the level up
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: levelReached is checked by its event validator at the subscriber's boundary, and the item by the items table's validator
  checklist: revision-preservation dismissed: an item is never revised; only its turnedAt is set, once
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: a level up is recorded once per member and level, its items are earned in that mutation, and a replay finds the record and writes nothing
  checklist: worker-fencing dismissed: no worker owns a level up; Convex serializes the mutations that touch one member's level-up rows
  checklist: commit-ordered-effects dismissed: earning an item issues no external effect
  checklist: durable-dispatch-intent dismissed: the items are earned in the level up's own mutation, so they commit with it or not at all
  checklist: resumption-coverage dismissed: no batch earns them, and turning hidden-items on runs no backfill
  checklist: declared-target-coverage dismissed: makeReady is the only caller, reached by the oracle through a kudos at the Slack boundary and through levelReached
  checklist: completion-evidence dismissed: nothing waits on the earn; the board reads the stored items
- a level item is drawn at its turn above its floor and pays nothing: Turning a level item draws its hoggie from its own crate at the turn, the third never below rare, answers nothing applied, leaves the member's XP and level as they were and takes the item off the board.
  over: a member's level 3 items turned one by one through turnItem with album, collection, packs and hidden-items on, read through the answers, the draw for each crate key and floor, getAlbum's level and board; the third item of each level up from 2 to 21, turned
  via: LP11 LP20: a level item is drawn at its turn, pays no XP, and the third never draws below rare
  refuted: the turn no longer handed the item's floor to dropFor -> 2 of 2 tests failed: the third item's turned hoggie was not the rare-floor draw, and level 10's third item turned below rare (2026-10-21)
  because: a level up's third hoggie was promised rare or rarer (LP7), so a turn that dropped the floor would hand out a common one, and a turn that paid a pack bonus would add XP that could level the member up again from inside their own level up
  kinds: state
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: turnedAt is set once and never moved
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read
  checklist: commit-ordered-effects dismissed: itemTurned is published in the turn's mutation, and the bus schedules its subscribers only when that mutation commits
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- the welcome item is earned once, at the first sign-in: A member's first sign-in earns them exactly one welcome item, a hoggie item keyed `welcome:first` with a rare floor and reason `welcome`, while `welcome-item` and `hidden-items` are both on for them; a person the directory does not know yet earns it when users.info verifies the check their first sign-in started, also at a later sign-in's check after every try of that one failed, since they never saw the album as a member; a later sign-in earns nothing more, a member who signed in before the flag earns none, and with either flag off the first sign-in earns nothing.
  over: a team_join member's first sign-in and a second sign-in on the account it made, read on the board and in the items table; a newcomer's first sign-in verified by users.info, then signing in again; a newcomer whose first sign-in's checks all failed, verified at a later sign-in; a sign-in with welcome-item off followed by one on the same account once it is on; a first sign-in with welcome-item off and one with hidden-items off
  via: LP44 LP50: a member's first sign-in earns one welcome item
  because: the welcome item is the newcomer's first reward (LP44): a second earn would hand a returning member another rare hoggie, an earn for a member who signed in before the flag would surprise everyone who already uses the website, and an earn while either flag is off would leave a dark feature's item waiting (LP50)
  refuted: earnWelcomeItem no longer read welcome-item and hidden-items before earning -> 3 of 4 tests failed: the member who signed in before the flag, and the first sign-ins with welcome-item off and with hidden-items off, each earned a welcome item (2026-10-21)
  refuted: a verification that found the member never earned the welcome item, whether or not it came from their first sign-in -> 1 of 6 tests failed: a person the directory learnt of only by verifying their first sign-in earned no welcome item (2026-10-21)
  refuted: a verification whose tries all failed cleared the first-sign-in mark -> 1 of 6 tests failed: a newcomer whose first sign-in's checks all failed earned no welcome item when a later sign-in verified them (2026-10-21)
  kinds: storage, state, identity
  checklist: scoped-reads dismissed: the earn reads only the signing-in member's own item of that key
  checklist: revalidated-permission dismissed: both flags are read in the sign-in's own mutation
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: the earn takes only the member the directory resolved from the sign-in claims, checked by allowedSignIn
  checklist: revision-preservation dismissed: the item is inserted once and only its turnedAt is set, once
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: a second earn finds the first by its member, source and key and writes nothing
  checklist: worker-fencing dismissed: no worker owns the item; two sign-ins conflict on the range they both read, so one retries and finds the other's
  checklist: commit-ordered-effects dismissed: earning the item issues no external effect
  checklist: durable-dispatch-intent dismissed: the item is earned in the sign-in's own mutation, beside the account it creates, so it commits with it or not at all; for a newcomer the first sign-in leaves a firstSignIns row beside its verification row, and the mutation that records the verified lookup earns the item and deletes both together; the mark lives in its own table so a revert's schema still reads every verification row
  checklist: resumption-coverage dismissed: no batch operation resumes; each sign-in is one mutation
  checklist: declared-target-coverage dismissed: the sign-in callback is the only writer in this slice; the welcome nudge joins it in a later slice through the same earnWelcomeItem
  checklist: completion-evidence dismissed: nothing waits on the earn; the board reads the stored item
  checklist: canonical-encoding dismissed: the member is the directory's, keyed by Slack's workspace and user ids exactly as the sign-in claims carry them
  checklist: identity-continuity dismissed: the first sign-in is the one Convex Auth links to no account; every later sign-in of the same Slack pair links to that account
  checklist: capability-authorization dismissed: no capability is presented; the callback runs only inside Convex Auth's sign-in
- the welcome item turns at least rare and teaches the loop once: The first turn of the welcome item draws its hoggie at or above rare, pays no XP, and answers the workspace's kudos emoji for the line that teaches the loop only while `welcome-item` is still on; a replayed turn and the turn of any other item answer no lesson.
  over: a first sign-in's welcome item turned through turnItem with every album flag on, read beside the rare-floored draw for its crate key and the member's XP; the same item turned again, then a thanks item's turn; the welcome item turned after welcome-item turned off
  via: LP11 LP44 LP49: the welcome item turns at least rare, pays no XP and teaches the loop once
  because: the welcome item is promised rare (LP44, LP46), so a turn that drew below the floor would break the nudge's one spoiler, a turn that paid XP would reward signing in rather than thanking (LP11), and a lesson on every turn would turn one sentence into a tutorial (LP49)
  refuted: lessonAfter taught the loop on a replayed turn too -> 1 of 3 tests failed: the replayed turn of the welcome item answered teaches (2026-10-21)
  refuted: earnWelcomeItem earned the welcome item without its rare floor -> 1 of 3 tests failed: the turn's hoggie was not the rare-floored draw for its crate key (2026-10-21)
  kinds: state, output
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the turn's own mutation
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: turnedAt is set once and never moved
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read
  checklist: commit-ordered-effects dismissed: the lesson is part of the answer and issues no effect
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
  checklist: scoped-reads dismissed: the lesson reads only the signed-in member's own item and their workspace's settings
  checklist: destination-confinement dismissed: the answer goes only to the signed-in browser that asked
  checklist: redaction dismissed: the lesson carries only the workspace's kudos emoji and its picture, which every member already sees in Slack
  checklist: circuit-breaker-policy dismissed: nothing is sent
  checklist: declared-target-coverage dismissed: turnItem is the only turn
- the old flow refuses while hidden-items is on: While `hidden-items` is on for the member, the website's openThoughtfulPack, putIn and putAllIn answer refused and write nothing, and once it is off each opens and puts in as today.
  over: two thoughtful packs, one opened into the tray with hidden-items off, then the other's open, the tray item's put-in and put-all-in with it on, read through every table, and each again once it is off
  via: LP23: with hidden-items on, the open, put-in and put-all-in refuse and write nothing
  refuted: keepsTheTray read only album, never hidden-items, before the open, put-in and put-all-in -> 1 of 1 tests failed: with hidden-items on the open answered opened instead of refused (2026-10-21)
  because: the item board is the one place a thanks's reward shows while the flag is on (LP23): an open beside it would draw a hoggie outside the turn and show it face up, and a put-in would land a face no turn brought
  kinds: state
  checklist: revalidated-permission dismissed: the flags and the session are read in the mutation that opens or puts in, so no permission is carried from an earlier check
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as the old flow refuses while hidden-items is on
  checklist: supersession-safety dismissed: a refusal writes nothing, so nothing it leaves can displace a later write
  checklist: worker-fencing dismissed: no worker owns a pack or a tray item; each command is one mutation
  checklist: commit-ordered-effects dismissed: a refusal issues no effect
  checklist: resumption-coverage dismissed: no batch operation resumes; each command is one mutation
- a tray item waits face down and its turn is the put-in: A tray item not yet put in waits on the item board for thanking its person, and its turn puts it in from the tray: the sticker puts the person in, the hoggie is found from the drop the open recorded with nothing applied, no drop is added, the member's XP stays and the tray empties; a tray item put in while the flag is off no longer waits once it is on.
  over: one thoughtful kudos opened into the tray with hidden-items off, read on the board once it is on, both items turned through turnItem, then read through getAlbum's level, board and people, getAlbumHoggies, the drop records and the tray once the flag is off again; a tray put all in with the flag off, read on the board once it is on
  via: LP23: a tray item not yet put in waits face down, and its turn finishes today's put-in
  refuted: the turn of a tray hoggie item answered its drop without putting its tray item in -> 1 of 2 tests failed: getAlbumHoggies found no hoggie after the tray hoggie's turn instead of the tray's (2026-10-21)
  refuted: the old put-in of a tray hoggie no longer marked its tray item turned -> 1 of 2 tests failed: a tray hoggie put in with hidden-items off still waited on the board once it turned on (2026-10-21)
  because: a tray item is a reward the member has not put in (LP23): one that waited nowhere would be lost while the tray is hidden, a turn that drew again would draw a second hoggie for one pack, and a turn that applied the pack's bonus again would pay the open's XP twice
  kinds: state
  checklist: revalidated-permission dismissed: the flags, the session and the item's and tray item's owner are read in the turn's own mutation
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a tray item waits face down and its turn is the put-in
  checklist: supersession-safety dismissed: the turn finishes only a tray item not yet put in, and the put-in marks its item turned, so neither moves the other once done
  checklist: worker-fencing dismissed: no worker owns an item; a turn and a put-in of one tray item conflict on the row they both read, so one retries and finds it put in
  checklist: commit-ordered-effects dismissed: the put-in and the turn issue no external effect beyond the bus events they publish in their mutation
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- a flag reversal never counts anything twice: A pack whose items all turned while `hidden-items` is on is opened by its last turn, so with the flag off it no longer waits, and its hoggie is found once and paid once; a pack whose hoggie turned with the flag on opens into only its sticker once it is off, and the hoggie is found once; a tray hoggie turned with the flag on leaves only its sticker in the tray once it is off.
  over: one thoughtful kudos whose two items turn with hidden-items on, then read and put all in with it off, through getAlbum's packs, the week tallies' hoggies found, the hoggie tallies and getAlbum's level; one thoughtful kudos whose hoggie alone turns with the flag on, then its pack opened and put all in with it off; one pack opened with the flag off, its tray hoggie turned with it on, then the tray read and put all in with it off
  via: LP23: a flag reversal never counts anything twice
  refuted: the old open put a pack's hoggie in the tray even when its item had turned -> 2 of 3 tests failed: a pack whose items all turned still waited, and a pack whose hoggie turned opened into its hoggie again (2026-10-21)
  refuted: the turn no longer opened a pack once its last item turned -> 1 of 3 tests failed: the pack still waited to open into nothing once the flag was off (2026-10-21)
  because: the flag can go either way while it is sandbox-only (LP6, LP23): an open that put a turned hoggie in the tray would count its find a second time at the put-in, and its sticker would wait to be put in twice
  kinds: state
  checklist: revalidated-permission dismissed: the open reads the items' turnedAt in its own mutation
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a flag reversal never counts anything twice
  checklist: supersession-safety dismissed: turnedAt and the pack's openedAt are each set once and never moved, so a later open reads what the turn left
  checklist: worker-fencing dismissed: no worker owns an item; an open and a turn of one pack's items conflict on the rows they both read
  checklist: commit-ordered-effects dismissed: no external effect is issued twice; each find publishes once, in the mutation that counts it
  checklist: resumption-coverage dismissed: no batch operation resumes; each open and turn is one mutation
- fillItems earns every waiting pack and tray item once: fillItems earns each pack a member has not opened its hoggie and sticker items and each tray item not yet put in its item, once, so they wait on the board and turn; a rerun earns nothing; a member with more than 100 of a kind continues in the next mutation, one member a mutation.
  over: two thoughtful packs, one opened into the tray, whose items predate the ledger, filled twice and read through the items table and the board, each turned; 101 packs and 101 tray items for one member and one of each for another, under Convex's transaction limits, read after the first mutation and after every scheduled one
  via: LP24: fillItems earns every pack not yet opened and every tray item not yet put in, once
  refuted: fillItems moved on after each kind's first page, never continuing from its cursor -> 1 of 2 tests failed: the member with 101 packs and 101 tray items held 200 items instead of 202 (2026-10-21)
  because: packs and tray items from before the ledger are rewards no board would show once the flag turns on (LP24): a fill that earned them twice would put one hoggie on the board twice, and one that read every pack of a member in one mutation would fail Convex's limits for the members who saved the most
  kinds: storage, state
  checklist: scoped-reads dismissed: the fill reads each member's own packs and tray by an equality on the member
  checklist: revalidated-permission dismissed: the fill runs by hand as an internal mutation and needs no member's permission
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: fillItems takes only its own step, checked by its validator
  checklist: revision-preservation dismissed: the fill only inserts items it finds missing and deletes and patches nothing
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: an earn that a grant, an open or an earlier fill already made finds that item and writes nothing
  checklist: worker-fencing dismissed: the fill and a grant or open earning the same item conflict on the range they both read, so one retries and finds the other's
  checklist: commit-ordered-effects dismissed: the fill issues no external effect
  checklist: durable-dispatch-intent dismissed: each step schedules the next in its own mutation, so the walk continues exactly when the step commits
  checklist: resumption-coverage declared as fillItems earns every waiting pack and tray item once
  checklist: declared-target-coverage dismissed: fillItems is run by hand and is the only backfill, reached by the oracle as the internal mutation
  checklist: completion-evidence dismissed: the walk ends when no member follows; the board reads the stored items
- a level item still waiting when hidden-items goes back off reaches the old reveal once: With `hidden-items` off and the old level-up drop on for a member, fillItems drops every level item still waiting through the old level-up drop, whichever flag kept it waiting, so getLevelUp answers the level's three drawn hoggies, the items are turned, nothing is paid, a rerun drops nothing more, and with `hidden-items` on again nothing waits; an item turned while the flag was on keeps its face; with `hidden-items` and `level-up-reveal` off it drops nothing and the items keep waiting; a member with more than 100 waiting level items continues in the next mutation.
  over: a member's level 2 reached with album, collection, packs, level-up-reveal and hidden-items on, filled while it is still on, then filled twice with hidden-items off, read through getLevelUp, the drop records, getAlbum's board and level once it is on again; the same level with one item turned while it was on; the same level filled with level-up-reveal off too; 35 levels reached with it on and filled with it off, under Convex's transaction limits
  via: LP6 LP24: with hidden-items back off, fillItems reveals every waiting level item through the old level-up drop, once
  refuted: fillItems' levels step no longer ran the level up's drop for the levels it read -> 3 of 4 tests failed: the old reveal of level 2 answered none, then only the hoggie turned while the flag was on, and 35 levels dropped nothing (2026-10-21)
  refuted: dropLevelUpHoggies dropped the level's hoggies whatever hidden-items said -> 3 of 4 tests failed: the board after a fill with hidden-items still on was empty instead of holding 3 items, and with both flags off the level had dropped (2026-10-21)
  refuted: fillItems' levels step moved to the next member after its first page instead of continuing from its cursor -> 1 of 4 tests failed: 35 levels dropped 102 hoggies instead of 105 (2026-10-21)
  because: while `hidden-items` is on a level up earns its hoggies as items and drops nothing (LP7), so a flag turned back off would leave them on a hidden board and the old reveal, which reads the drops, would answer nothing, losing them (LP6, user story 24); revealing them through the old drop keeps the same draw, pays nothing, and marks them turned so a flag turned on again shows no duplicate
  kinds: state
  checklist: revalidated-permission dismissed: the fill runs by hand as an internal mutation and reads both flags for the member in its own mutation
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a level item still waiting when hidden-items goes back off reaches the old reveal once
  checklist: supersession-safety dismissed: a level item's turnedAt is set once and the drop is recorded once per crate, so a turn, a level up or a rerun that comes after finds them and writes nothing
  checklist: worker-fencing dismissed: no worker owns an item; the fill and a turn of one level item conflict on the rows they both read, so one retries and finds the other's
  checklist: commit-ordered-effects dismissed: no external effect is issued twice; each drop publishes once, in the mutation that records it
  checklist: resumption-coverage declared as a level item still waiting when hidden-items goes back off reaches the old reveal once
- a filled team earns one hoggie the member does not own, rare or rarer: Filling a team page earns its member one hoggie item keyed by the team with reason `team` naming the team and its name and a rare floor, shown on the item board with the team's name, and its turn draws a rare or rarer hoggie the member does not own at that moment, pays no XP and answers it new.
  over: a team page of three filled by its member's two sticker turns, with the hoggie the team's crate key would draw at its floor already owned, read through the stored items, getAlbum's board and the team item's turn through turnItem
  via: LP62 LP63: a filled team page earns one hoggie the member does not own, rare or rarer
  refuted: the turn no longer asked dropFor for a hoggie the member does not own, for a team item too -> 1 of 1 tests failed: the team item's turn drew the hoggie the member already owned (2026-10-21)
  because: a filled team is a hard achievement the old album paid only with a sticker (LP62), so an item without its floor would pay it like a common pack hoggie, and a draw that ignored what the member owns would hand back a hoggie they already hold and spoil the reward (LP63)
  kinds: storage, state
  checklist: scoped-reads dismissed: the earn and the draw read only the member's own items and hoggie tallies, by an equality on the member
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: the earn takes the team page the album resolved for the member, checked by the items table's validator
  checklist: revision-preservation dismissed: an item is never revised; only its turnedAt is set, once
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: the team sticker is inserted once per filled page and the item in that mutation; a second earn finds the first by its key and writes nothing
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read
  checklist: commit-ordered-effects dismissed: earning the item issues no external effect, and the turn publishes itemTurned in its own mutation
  checklist: durable-dispatch-intent dismissed: the item is earned in the team sticker's own mutation, so it commits with it or not at all
  checklist: resumption-coverage dismissed: no batch earns it; each team sticker and each turn is one mutation
  checklist: declared-target-coverage dismissed: the album's insertTeamSticker is the only writer of a team sticker, reached by the oracle through the turn and by the old unlock in the flag oracle
  checklist: completion-evidence dismissed: nothing waits on the earn; the board reads the stored item
- each milestone tier earns one hoggie the member does not own at its tier's floor: Each milestone tier recorded for a member earns them one hoggie item keyed by the milestone and tier with reason `milestone`, while `rarity-caps` is off for the member at the earn its floor uncommon for bronze, rare for silver, epic for gold and legendary for diamond, once however often the tiers are recorded again, and its turn draws a hoggie at or above that floor the member does not own at that moment, counting the hoggies turned before it in the same visit.
  over: a member owning every common and uncommon hoggie whose sticker turn records the hoggies tiers bronze, silver and gold, each tier's item turned in turn through turnItem; the same tiers recorded again by recordMilestonesInWorkspace
  via: LP62 LP63: each milestone tier earns one hoggie the member does not own, at or above its tier's floor
  refuted: every milestone tier's item took the bronze tier's uncommon floor -> 1 of 2 tests failed: the silver and gold items' floors read uncommon instead of rare and epic (2026-10-21)
  because: harder tiers must pay better (LP62), so a floor that did not rise with the tier would pay a diamond medal like a bronze one, and a draw that read what the member owned before the visit rather than at the turn would pay the same new hoggie twice in one visit (LP63)
  kinds: storage, state
  checklist: scoped-reads dismissed: the earn and the draw read only the member's own items and hoggie tallies, by an equality on the member
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it
  checklist: encrypted-storage dismissed: items are game data, not confidential
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: input-validation dismissed: the milestone and tier come from the album's catalogue, checked by the items table's validator
  checklist: revision-preservation dismissed: an item is never revised; only its turnedAt is set, once
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as an item is earned once per member, source and key
  checklist: supersession-safety dismissed: a tier is recorded once per member, and its item in that mutation; a second earn finds the first by its key and writes nothing
  checklist: worker-fencing dismissed: no worker owns a tier; Convex serializes the mutations that read one member's tier range
  checklist: commit-ordered-effects dismissed: earning the item issues no external effect
  checklist: durable-dispatch-intent dismissed: the item is earned in the tier record's own mutation, so it commits with it or not at all
  checklist: resumption-coverage dismissed: the workspace walks that record tiers resume from their own cursors, and each page earns the items of the tiers it records
  checklist: declared-target-coverage dismissed: the album's recordTiersOf is the only writer of a tier, reached by the turn, the Slack tallies, the hoggie drop subscriber and the workspace walks
  checklist: completion-evidence dismissed: nothing waits on the earn; the board reads the stored item
- a reward whose floor and above the member owns whole draws a duplicate at its floor: When the member owns every hoggie at or above a team or tier item's floor, its turn draws an owned hoggie at or above the floor, never a lower one.
  over: a member owning every hoggie whose sticker turn records the hoggies tiers up to diamond, the gold and diamond items turned through turnItem
  via: LP64: a reward whose floor and above the member owns whole draws a duplicate at or above its floor
  refuted: a draw that found no hoggie unowned at or above its floor fell back to every rarity from common -> 1 of 1 tests failed: the gold tier's item drew a common hoggie, below its epic floor (2026-10-21)
  because: a harder achievement must never pay a lower rarity than an easier one (LP64), so a draw that fell below the floor to find a new hoggie would let a diamond medal pay a common, and a draw that found nothing would turn the item into nothing
  kinds: state
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: turnedAt is set once and never moved
  checklist: worker-fencing dismissed: no worker owns an item; two turns of one item conflict on the row they both read
  checklist: commit-ordered-effects dismissed: itemTurned is published in the turn's mutation
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- every other draw keeps its duplicates: A thanks item's turn draws the hoggie its crate key draws, whether or not the member already owns it.
  over: a thanks item whose crate key's draw the member already owns, turned through turnItem
  via: LP63: every other draw keeps its duplicates
  refuted: dropFor drew every crate among the hoggies the member does not own, not only a team or tier item's -> 1 of 1 tests failed: the thanks item's turn drew another hoggie than its crate key's owned one (2026-10-21)
  because: only achievements are deduplicated (LP63); a pack draw that read the collection would change every existing draw's pure function of the secret, the member, the crate key and the catalogue version (LP11), and with it every hoggie a replay or the old open answers
  kinds: state
  checklist: revalidated-permission dismissed: the flags, the session and the item's owner are read in the same mutation that turns it
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession declared as a turn draws the hoggie and pays once
  checklist: supersession-safety dismissed: turnedAt is set once and never moved
  checklist: worker-fencing dismissed: no worker owns an item
  checklist: commit-ordered-effects dismissed: itemTurned is published in the turn's mutation
  checklist: resumption-coverage dismissed: no batch operation resumes; each turn is one mutation
- team and tier items wait unseen while achievement-hoggies or hidden-items is off: While `achievement-hoggies` or `hidden-items` is off for the member, their team and tier items are earned but neither shown on the item board nor turned, nothing about them is drawn, and once both are on each waits on the board once.
  over: a team filled with achievement-hoggies off, read on the board, turned and read for drops, then read and turned with it on; a team filled through the old open, put-all-in and unlock with hidden-items off, then read and turned with it on; a team item waiting when achievement-hoggies turns off and on again
  via: LP65: achievement items wait unseen while achievement-hoggies or hidden-items is off, and nothing is lost
  refuted: the ledger's waiting read no longer read achievement-hoggies, so team and tier items always waited on the board -> 2 of 3 tests failed: with achievement-hoggies off the board showed the team item (2026-10-21)
  refuted: the turn no longer read achievement-hoggies before turning a team or tier item -> 1 of 3 tests failed: with achievement-hoggies off the team item's turn answered turned instead of refused (2026-10-21)
  because: the reward ships dark behind its flag (LP65), so an item shown or turned with the flag off would leak a dark feature onto every member's board; and the writers earn whatever the flags say (LP6), so an item hidden by deleting it or by drawing it would be lost when a flag turns back off
  kinds: state, output
  checklist: scoped-reads dismissed: the board reads only the signed-in member's own items
  checklist: redaction dismissed: with either flag off the item is left out of the board and every count built on it
  checklist: revalidated-permission dismissed: both flags are read in the board's read and in the turn's mutation
  checklist: separation-of-duties dismissed: no approval policy
  checklist: legal-state-succession dismissed: with either flag off a refused turn moves nothing
  checklist: supersession-safety dismissed: a refused turn writes nothing, so nothing it could displace
  checklist: worker-fencing dismissed: no worker owns an item
  checklist: commit-ordered-effects dismissed: a refused turn publishes nothing
  checklist: resumption-coverage dismissed: no batch operation resumes
  checklist: declared-target-coverage dismissed: the ledger's waitingOf is the one read under the board, the waiting count and the sticker check, and turn the one mutation that reveals an item
  checklist: destination-confinement dismissed: nothing is sent
  checklist: circuit-breaker-policy dismissed: nothing is sent
