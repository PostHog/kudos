# Spec: hugs are the hook

> **The spec of Silthus/personal#221**, the spec ticket of the hugs-hook map (Silthus/personal#214). Rules are cited as `HH1`–`HH120`. Rules of other specs keep their numbers, and every rule here that changes one names it: `MQ` (`spec/monday-quests.md`), `LP` (`spec/core-loop.md`), `HF` (`spec/hoggie-forge.md`), and the invariants of the module specs by their names.
>
> **Stopping points**, one flag each where members see a change, each widened from its sandbox proof straight to 100% in production with an annotation (map decision, 2026-10-29):
> 1. **Two ways to thank** (HH6–HH15): the thoughtful classification loses every reader; packs, the replies, the milestone, the Monday post and the received-kudos welcome follow any kudos. No flag: a counting and copy change, rolled back by a revert, as Silthus/kudos#810 and #811 were.
> 2. **The seams** (HH16–HH31): Hugs decides every reaction, writes cross modules as bus facts, `Progression` owns every XP rule, Leaderboard owns every count, `Album` owns collecting. No flag: no member sees a change.
> 3. **Hugs pay** (HH32–HH38) behind `hug-rewards`: the first-hug bonuses and hug finds.
> 4. **Rarity** (HH39–HH44) behind `rarity-caps`: kudos are the only source of epic and legendary.
> 5. **Two quests a week** (HH45–HH57) behind `two-quests`: a hug quest and a kudos quest every week, and the hug ladder.
> 6. **The hype nudge** (HH58–HH60) behind `hype-nudge`: the Monday DM's "give X a kudos to collect their hype emoji".
> 7. **Activity** (HH61–HH68) behind `activity-next`.
> 8. **Leaderboard** (HH69–HH82) behind `leaderboard-hugs`.
> 9. **The Book explains itself** (HH83–HH89) behind `book-next`.
> 10. **Instrumentation** (HH90–HH94). No flag.
>
> HH1–HH5 hold for every stopping point, and HH95–HH120 are free for amendments. 2 comes first; 3, 4, 5, 6 and 8 build on it; 7 builds on 5; 1, 9 and 10 stand alone.
>
> Sources: the map's decisions (Silthus/personal#214); the rarity research (Silthus/personal#215, `docs/research/hoggie-rarity/README.md` on branch `research/hoggie-rarity`); the team-scoring research (Silthus/personal#216, `docs/research/team-scoring.md` on branch `research/team-scoring`); the hugs architecture (Silthus/personal#217, `docs/architecture/hugs-hook.md` and ADR-0014 to ADR-0017 on branch `prototype/hugs-architecture`); the accepted UI prototypes for Activity (Silthus/personal#218, branch `prototype/activity-never-empty`), the Leaderboard (Silthus/personal#219, branch `prototype/leaderboard-never-empty`) and the Book (Silthus/personal#220, branch `prototype/book-explains-itself`); the subscriber audit (Silthus/personal#234); the conductor's scope note on this ticket; the code on `main` at `7f3257a6`, with Silthus/kudos#810 (MQ46–MQ48) merged. Where an input conflicts with the product owner's own call, his call wins. Where this spec differs from the architecture capture, this spec wins, and it says so.

## Problem Statement

Members already thank each other the light way: they react to a teammate's message with the kudos emoji, a hug. Hugs are the thanks most members give. The loop pays them almost nothing for it: 1 XP each way, no find, no quest, no place on any board. Everything that pays (packs, boards, quests, the Monday post) waits for a kudos that "says why", a thoughtful kudos that most members never write, so most members see an album, a leaderboard and an Activity page that stay empty.

Rarity runs the other way. A newcomer's welcome and their first level-ups draw from rare floors, and gold and diamond milestones guarantee epic and legendary hoggies, so the few who play reach the top rarities in their first weeks, and nothing is left to look forward to.

The website doesn't help a member who wants to do more. Activity is empty until someone thanks you. The Leaderboard ranks thoughtful kudos given, which most weeks leaves the board nearly empty, and one team always leads. The Book shows locked stickers and "Not found yet" placeholders that do nothing when clicked. Quests stop once the onboarding ones are done, and none of them counts a hug.

And the change can't be judged yet: `hug given` doesn't name its reaction, the Leaderboard and Activity record no production views, and a page view doesn't say where the visit came from.

## Solution

**A hug is a real thanks that pays, finds hoggies and counts on every board, a kudos is the bigger thanks and the only way to the rarest hoggies, and every page always shows the next simple step.**

- **Two ways to thank, nothing else.** A hug is a reaction with the kudos emoji (or an emoji you collected). A kudos is a message that mentions someone with the kudos emoji. Nothing asks a member to say why any more: any kudos earns its packs, counts on the boards and for quests, and welcomes the person thanked.
- **Hugs pay.** The first hug a member gives each day and the first hug they receive each week pay a bonus. A hug given can find a hoggie, at most one a day, never above rare.
- **Rarity stops saturating.** Only a kudos can bring an epic or legendary hoggie. `Welcome`, level-ups, quests, milestones, completed teams and the forge stop at rare.
- **Two quests every week.** One hug quest and one kudos quest, from the first week on. A newcomer's hug quests are a short ladder (3 hugs, then 5, then 10), beside the three onboarding kudos quests.
- **Collect people through their hype emoji.** The Monday DM nudges "give Mara a kudos to collect :mara-hype:" for a teammate whose hype emoji the member keeps reacting with but hasn't collected.
- **No empty page.** Activity leads with one next step and the week's two quests, and lists who thanked you. The Leaderboard leads with you, ranks people by hugs given, hugs received, kudos received, level or hoggies, and races teams on how many more teammates joined in than last week. The Book shows the next five milestones and explains every locked sticker.
- **Measured.** `hug given` names its reaction, the Leaderboard and Activity record their views in production, and a page view names where it came from.
- **Straight to 100%.** Each flag goes from its sandbox proof straight to 100% in production, with an annotation.

## User Stories

**Two ways to thank**

1. As a member, I want any kudos I give to count as a real thanks, so that I never have to learn a rule about saying why.
2. As a member, I want every kudos I give to bring a pack for each person I thank, once per person and week, so that thanking more people is what pays.
3. As a member who is thanked with any kudos, I want my one welcome, so that the first thanks I get introduces HedgeHug to me.
4. As a member, I want no copy anywhere to say "thoughtful" or "say why", so that the two ways to thank are all I have to remember.
5. As a member, I want my kudos milestone to count every kudos I gave, so that the ladder moves with what I actually do.
6. As a member reading the Monday post, I want the week's top kudos, so that any kudos can be celebrated.
7. As a member who already earned something under the old rules, I want to keep it, so that the change never takes anything away.

**Hugs pay**

8. As a member, I want my first hug each day to pay more XP than later ones, so that one hug a day is worth the habit.
9. As a member, I want the first hug I receive each week to pay more XP, so that being hugged feels like something.
10. As a member, I want a hug I give to sometimes find a hoggie, so that reacting has a small surprise in it.
11. As a member, I want at most one hug find a day, so that hugging stays light and nobody farms hoggies.
12. As a member, I want a hug find to wait face down on my item board like any item, so that it plays the same reveal.
13. As a member, I want a redelivered or re-added reaction to pay and find nothing twice, so that rewards stay fair.
14. As a member, I want a hug to land in my own week and my own day, in my own time zone, so that the bonuses and the boards agree.

**Rarity**

15. As a member, I want only kudos to bring epic and legendary hoggies, so that the rarest finds mean someone took the time to write.
16. As a member, I want the welcome, level-ups, quests, milestones and completed teams to bring at most a rare, so that the rarest hoggies stay rare.
17. As a member who owns every rare, I want my next draw to stay as likely to be rare as before, so that collecting never quietly raises the odds.
18. As a member, I want the forge to make at most a rare, so that duplicates still have a use without becoming a back door to epic.
19. As a member with items earned before the change, I want them to keep the odds they had when I earned them, so that nothing I was promised changes.

**Quests**

20. As a member, I want one hug quest and one kudos quest every week, so that there is always an easy step and a bigger one.
21. As a newcomer, I want my first hug quests to be `Give 3 hugs`, then 5, then 10, so that hugging becomes a habit before anything else.
22. As a newcomer, I want my kudos quests to be the three onboarding ones, so that my first kudos are guided.
23. As a member who finished onboarding on one side, I want a drawn quest of that kind each week, so that I'm never left without a quest of that kind.
24. As a member, I want a hug quest such as `Hug messages on 2 different days` or `React to 10 messages this week`, so that a light habit is enough to finish it.
25. As a member, I want a kudos quest such as `Thank someone new` or `Thank 3 people in one day`, so that the bigger thanks has a goal too.
26. As a member, I want the same two quests in the Monday DM, the quests panel and on Activity, so that every surface names the same next step.
27. As a member, I want a quest to pay once, however often Slack resends the event, so that rewards stay fair.

**The hype nudge**

28. As a member who keeps reacting with a teammate's hype emoji, I want the Monday DM to tell me a kudos to them collects it, so that I learn how to make it count.
29. As a member who already holds that hype emoji, I want no nudge for it, so that the DM never asks for what I have.

**Activity**

30. As a member opening Activity with nothing yet, I want one next step with one Slack button, so that I know exactly what to do.
31. As a member who was thanked this week, I want the step to be hugging that kudos back, one click to the message, so that thanks flows back.
32. As a member, I want the week's two quests on Activity as a checklist, so that I see my progress where I look.
33. As a member, I want to see who thanked me this week, with their words, so that I know who to thank back.
34. As a member, I want one line about last week with a link to read it, so that history is there without crowding the week.

**Leaderboard**

35. As a member, I want the Leaderboard to start with me and one positive highlight, so that it never tells me I'm losing.
36. As a member, I want to rank people by hugs given, hugs received, kudos received, level or hoggies, so that hugs and kudos both count.
37. As a member, I want my place in my team on the same measure, so that I can see how I help my team.
38. As a member of a small or quiet team, I want teams to climb on how many more teammates joined in than last week, so that any team can lead.
39. As a member, I want no team named last and no negative number anywhere, so that the race stays friendly.
40. As a member, I want the emojis within my reach and how to get each, so that I know what to do next.
41. As a member, I want every row to open its person or team page, so that clicking a row does something.
42. As a member in Slack, I want App Home's Leaderboard and `/hedgehug leaderboard` to rank by the same counts, so that Slack and the website agree.

**The Book**

43. As a member, I want my next five milestones in one row with what each takes, so that I know what's next at a glance.
44. As a member, I want a locked sticker or progress bar to open a card with how to get it and what it pays, so that a click on something locked teaches me.
45. As a member, I want `Hoggies` and Milestones above the teams in the sidebar, and "Show more" to expand the teams in place, so that the sidebar stays put.

**Measurement and rollout**

46. As the product owner, I want `hug given` to name its reaction, so that I can see which emojis members hug with.
47. As the product owner, I want `leaderboard viewed` and `activity viewed` in production, so that I can measure whether the new pages are used.
48. As the product owner, I want a page view to name where the visit came from, so that I can tell DMs, App Home and shared links apart.
49. As the product owner, I want each piece behind its own flag at 100% once proven, so that I can turn one off without a deploy.
50. As the product owner, I want weekly active members and hug activation to move, so that the map is judged on what it set out to change.

## Implementation Decisions

### Vocabulary, copy and flags

- **HH1 The lexicon.** The first ticket of each stopping point declares the terms it brings in `lexicon.json`, before any code uses them: **hug find** (a hoggie item a hug given earns, HH35), **hype reaction** (a reaction with a member's hype emoji that the giver doesn't hold, which is no hug, HH19), **recognition fact** (Quests' one shape for a kudos or a hug, HH52), **hug quest** and **kudos quest** (the two quests of a week, HH45), **hug ladder** (the three onboarding hug quests, HH46), **joined in** (a member who gave a hug or a kudos in the period, HH76) and **next step** (the one action a page offers, HH63, HH72). **thoughtful kudos** stays declared for the stored gate decision and leaves every member-facing text (HH6).
- **HH2 Two ways to thank.** A **hug** is a reaction that Hugs accepts (Hugs' rules, unchanged but for HH19's hug back: the kudos emoji or an earned emoji the giver holds, within 24 hours, once per giver and message, within the hug budget). A **kudos** is a Given message that mentions someone with the kudos emoji (`Engine`'s rules, unchanged). Nothing else thanks.
- **HH3 One wording.** Every text this spec adds or changes names a hug as a reaction and a kudos as a message, with the workspace's kudos emoji, and never says "thoughtful", "say why" or "says why". No quest carries a difficulty label (Easy, Middle, Hard) anywhere. No 💜 anywhere this spec touches.
- **HH4 The flags.** Each new flag (`hug-rewards`, `rarity-caps`, `two-quests`, `hype-nudge`, `activity-next`, `leaderboard-hugs`, `book-next`) is created in project 662840 sandbox-only, one condition `environment = sandbox` at 100%, safe default off. Each is read for the member with an exposure in the mutation that decides what the member gets, and without one elsewhere. A website page chooses its variant in its query without writing (`memberDecisionWithoutWriting`), and the page's view mutation (HH91, HH92) records the exposure. Once its sandbox proof is green, its lane widens it straight to 100% in production with an annotation (map decision, 2026-10-29). While a flag is off for a member, what it covers is as before, byte for byte.
- **HH5 Nothing stored changes.** Awards, gate decisions, reward records, items, drops, packs, milestones and quest records stay as they were stored (ADR-0001, ADR-0002, ADR-0004). Every new rule applies to what is earned, counted or decided after it ships, unless the rule says otherwise.

### Two ways to thank (no flag)

- **HH6 Nobody reads the thoughtful decision.** `Engine` still decides and stores each award's gate decision (ADR-0004), and analytics keeps `thoughtful` on `kudos given`. Every other reader treats any kudos as it treated a thoughtful one: `Album`'s pack earn, tallies, milestones, history and kind note; `Progression`'s skill-tree bonuses, receiving coins and the "would have earned more" perk check; Quests' counting (HH50, HH52); `Welcome`'s received trigger (HH12); `Feedback`'s replies and nudge; Leaderboard's new givers and top kudos; `Engine`'s quotable-kudos check. Groups' attribution keeps storing it and Activity's `saidWhy` keeps answering it, with no member-facing reader.
- **HH7 Packs from any kudos.** Any kudos to someone else earns its giver one pack per person and giver's week, with today's grant: the person's sticker when the grant decides one, the hoggie, the person's hype emoji named, 15 XP at the turn (amends `Album`'s "a thoughtful pack is earned once per giver, person and week" and `Items`' "a thanks earns its hoggie": "thoughtful" becomes "any"). The pack keeps its storage names. `thoughtfulPacksGranted` keeps its name and is published once per kudos message.
- **HH8 One reply for any kudos.** The after-kudos thread reply (LP25, `Feedback`'s "a thoughtful kudos gets one thread reply") follows any kudos, and loses the line that says saying why would have earned more.
- **HH9 The kudos milestone counts any kudos.** The milestone stored as `thoughtful` counts every kudos award given from the moment this ships, under its stored id and its step names; its ladder reads `Kudos given` where a ladder name shows. Tiers already recorded stay. Nothing recounts kudos given before.
- **HH10 The Monday post's top kudos.** The post that `album-slack` makes reads `🏆 Last week's top kudos` and quotes the week's top public kudos by today's ranking (hugs, then recipients, then recency), from any kudos (amends LP89–LP92 and `Feedback`'s weekly-post invariants). New givers are ranked by all their kudos awards.
- **HH11 The kind note and the norm line.** The profile's kind note is the newest kudos the member received whose words can show (amends `Album`'s "the profile's kind note is the last thoughtful kudos the member received"). App Home's norm line reads `N teammates gave kudos this week`, counting givers of any kudos (amends `Feedback`'s "the norm line counts this week's thoughtful givers").
- **HH12 Any kudos received welcomes.** On the Monday path, any kudos received welcomes each recipient who has no `welcomes` row, stored with path `thoughtful-received` (amends MQ14 and the last clause of MQ46). The welcome quotes the kudos as today.
- **HH13 The drawn pool loses "say why".** The five say-why quests leave the pool, and their ids stay in the validator because stored draws name them (amends MQ8). While `two-quests` is off for a member, their three drawn quests a week come from the kudos pool of HH50.
- **HH14 The hugs closing line.** The hugs recap's and hugs section's closing reads `Hugs are a quick thanks. A kudos, a message that mentions a teammate with :<kudos emoji>:, earns much more XP.`
- **HH15 Every other copy.** Every remaining member-facing text that says thoughtful or say why, in Slack and on the website, takes HH3's wording: the emoji popup, App Home, the replies, the Monday post, the milestone ladder, and the Leaderboard until HH69 replaces it. The legacy unlock path's quests stay dark and unchanged until Silthus/personal#233 deletes them.

### The seams (no flag)

These rules carry the hugs architecture (Silthus/personal#217) into the repo. `docs/architecture/hugs-hook.md`, its diagrams and ADR-0014 to ADR-0017 come from `prototype/hugs-architecture` with the first ticket, amended where this spec differs (HH35), each ADR recorded with `coherence decide`.

- **HH16 Writes cross modules as bus facts.** A write into another module travels as a fact on the bus, and a read calls the other module's seam. A guard test fails when a file imports another module's write function (`recordReward`, `applyGain`, `earnItem`, `markTurned`, `dropFor` and the like) or queries a table another module owns, from one map of table to module. Today's offenders sit on an allowlist, and the test fails when an allowlisted pair no longer occurs, so the list only shrinks (ADR-0014).
- **HH17 A failed subscriber is replayed by hand.** An internal `replay(job)` answers `not failed` unless the job failed, `not a subscriber` unless its function is a registered subscriber or a subscriber's own next page, and `already replayed` when it replayed that job before; otherwise it records the replay and schedules the same function with the same arguments in one mutation. An operator runs it from the sweep's error report. Nothing replays on its own. Message-sending subscribers stay outside it until Silthus/personal#235 makes them safe.
- **HH18 Every new subscriber is delivered twice.** Each subscriber this spec adds has a test that delivers its fact twice and expects one effect.
- **HH19 Hugs decides every reaction.** The Slack adapter asks Hugs' `mayReactWith` query first, which answers true for the kudos emoji, for an earned emoji the giver holds (today's `mayGiveHugWith`), and for an emoji `Album`'s `hypeEmojiFor` resolves, so every other reaction stays a query and never reaches a mutation. `decideReaction` replaces `giveHug` and keeps all its checks. It answers a **hug** when the emoji is the kudos emoji or one the giver holds, a **hype reaction** when the emoji is a member's hype emoji that the giver neither owns nor holds, and **nothing** otherwise. A recipient who hugs the Given kudos message they received hugs it back: the hug is for the kudos' author alone, as a hug on the author's own message would be, so the author is paid and counted as hugged (amends Hugs' "the author or a recipient hugging it does nothing" for recipients; the author hugging their own kudos still does nothing, and anyone else's hug on it stays for its recipients).
- **HH20 The hug facts.** A hug publishes `hugGiven` once, carrying `author` exactly when the hug is for one person (a hug on an ordinary message, or a hug back), and `first` for the giver's first hug ever. Hugs' people pages (100 people a page) publish one `hugReceived` per paid person, with that person's own `week`, after writing their paid row, and pay nothing themselves. A hype reaction writes nothing in Hugs and publishes `hypeReacted { giver, owner, author, emoji, message }`. New fields on existing facts are optional, because jobs already scheduled carry the old shape.
- **HH21 `Album` answers who owns a hype emoji.** `hypeEmojiFor(giver, emoji)` resolves the emoji through the emoji registry, never by its `-hype` suffix, and answers its owner and whether the giver holds it (`hypeEarnedBy`), or nothing when no member owns it.
- **HH22 `Album` keeps the hype reactions.** `Album` follows `hypeReacted` and writes one row per giver, owner and message, so a redelivered or re-added reaction does nothing. A row on a message whose author isn't the owner is kept but counts for nothing here. Silthus/personal#228 decides what ten rows collect; this spec reads them only for the nudge (HH58).
- **HH23 `Progression` owns every XP rule.** `Progression` follows `hugGiven` and pays the giver `hugXp` under today's key `hug-given:{conversation}:{message}`, follows `hugReceived` and pays the person `hugXp` under today's key `hug:{giver}:{conversation}:{message}`, and follows `questFinished` with a `rewardKey` and pays the quest's XP under that key, without coins. Hugs and Quests no longer import `recordReward`, and the giver's hug XP arrives a moment after the hug, as kudos XP does. A member who left gets nothing, and nothing throws for them.
- **HH24 Quests publishes its finish and pays nothing.** A Monday-path finish writes Quests' own finish row, keyed by member and reward key, and publishes `questFinished` with `rewardKey`, `reward`, `catalogueVersion` and `cause`. A second finish of the same key publishes nothing. Quests' finish record is the one answer to "is this quest finished": the onboarding steps, the next quest and the weekly draw's checks read it instead of `Progression`'s reward records. Before the new finish writer runs, a one-off seed writes a finish row for every Monday-path quest already finished, under its member and reward key, publishing nothing. `Album` follows it and earns the quest's hoggie under today's key `quest:<reward key>` (ADR-0015, amends MQ10's "one mutation" and ADR-0013). The legacy unlock path's finish stays on the allowlist until Silthus/personal#233.
- **HH25 `Album` owns collecting.** `Items`' ledger and `Hoggies`' draw, drops and forge move under `Album` as its parts, and leave the public surface except through `Album`'s seam: `albumOf`, `turn`, `hypeEmojiFor`, `nudgesFor` and `holdsEarnedEmojiNamed` (ADR-0017, amends the ownership sentences of ADR-0009 and ADR-0010). Level-up hoggies move from `Unlocks` to an `Album` follower of `levelReached`, with today's keys. `Welcome`'s and Achievements' earns and the forge's own earn stay on the allowlist until Silthus/personal#232. The turn stays a direct call (ADR-0010, LP13–LP15).
- **HH26 Leaderboard owns every count.** Leaderboard's per-member totals by day, week, month and all time grow `kudosReceived`, `hugsGiven` and `hugsReceived` beside today's kudos given, optional and read as 0, and `firstDay`, the member's first day in the period on which they gave a hug or a kudos (HH76). Three followers count them: `countKudosGiven` counts the giver as today and each recipient's kudos received in pages of 100 recipients with a `from` offset; `countHugGiven` follows `hugGiven`; `countHugReceived` follows `hugReceived`. Each count lands in the member's own day, week and month, in their time zone, and is keyed in Leaderboard's counted table (`kudos-received:{award}`, `hug-given:{giver}:{message}`, `hug-received:{person}:{giver}:{message}`), so a redelivery counts nothing twice (ADR-0016, amends Leaderboard's "the leaderboard counts kudos given, never kudos received" and Hugs' "a hug is never an award": a hug now counts on boards, never as an award or a kudos).
- **HH27 The backfill.** A one-off backfill fills the three counts and `firstDay` for past periods from the stored awards and hugs, through the same keys, so a fact the live followers and the backfill both reach counts once, as Leaderboard's backfill of kudos given did. It pages within Convex's limits and can run again with no effect.
- **HH28 The boards read one range.** `boardsOf(viewer, { period, team })` reads one index range, the period's rows for the workspace, ranks people by each count in memory, sums teams, skips members who left the boards (`isOnTheBoards`) and pins the viewer. `placeOf(member, period)` answers one member's place, and `totalsOf(member, period)` reads one row.
- **HH29 Every board reader moves to Leaderboard.** The player card reads `placeOf`, the link card reads `boardsOf` for all time, and the Monday post asks `Album`'s seam for team emojis instead of importing them. `Album`'s boards, its thoughtful givers, its board tallies, `getThoughtfulBoards` and the `thoughtfulBoardTallies` table retire once nothing reads them, with the flag (HH82).
- **HH30 The hugs section and the weekly issue read Leaderboard.** `hugWeeks` keeps only the recap's delivery state and the most-hugged message. The hugs section and recap read the week's hugs given and received from `totalsOf`, and their XP from `Progression`'s seam `hugXpOf(member, week)`: the counts times `hugXp`, plus the day bonuses recorded under `hug-day:{day}` for the week's seven days and the week bonus under `hug-week:{week}`, each one keyed lookup. `Album`'s weekly issue (today's Activity, and `Read last week`, HH67) reads its kudos and hug counts from `totalsOf` too, each in the member's own week, and keeps its people lists, new faces and hoggies; `Album`'s own weekly kudos and hug counters then have no reader and retire with HH82.
- **HH31 The cost.** A reaction that names neither the kudos emoji nor a hype emoji costs one query, as today. A hug to n people schedules about 8 followers of `hugGiven` and, per page of up to 100 people, 3 followers per person, under Convex's 1,000 scheduled functions per mutation. Each follower reads one or two index ranges. A kudos to a large group leaves `Engine`'s giving mutation unchanged (Silthus/kudos#243). The architecture capture's read budgets hold.

### Hugs pay (`hug-rewards`)

- **HH32 The first hug given each day.** `Progression`'s `hugGiven` follower also pays the giver the day bonus under `hug-day:{day}`, the giver's own day, so the first hug of the day pays the bonus and every later one that day finds the key recorded and pays nothing more. Two hugs at once race on one key, and Convex's retry lets one pay. The amount is in the numbers table.
- **HH33 The first hug received each week.** `Progression`'s `hugReceived` follower also pays the person the week bonus under `hug-week:{week}`, the person's own week, once however many people hug them. The amount is in the numbers table.
- **HH34 The bonus follows the flag at the hug.** Hugs reads `hug-rewards`, with an exposure, for the giver in the hug's own mutation and for each person in the people page that writes their paid row, and puts the answer on `hugGiven` and `hugReceived` as `rewards`. The followers pay a bonus or a find only when the fact says `rewards`, never reading the flag themselves, so a late delivery or a replay after the flag changed pays what was decided at the hug, and a fact without `rewards` (a job from before) pays no bonus. Tests deliver a fact after the flag changed both ways.
- **HH35 A hug given can find a hoggie.** `Album` follows `hugGiven` (this spec differs from the architecture's `hugReceived` here: the giver is the one forming the habit, and a hug on a kudos message would otherwise fan finds out to every recipient). When `hugGiven` says `rewards` (HH34), the hug finds with the chance in the numbers table, decided from the hug's own key by the deployment's draw secret, so a replay decides the same. A find earns the giver one face-down item, source `hoggie`, crate kind `hug`, key `hug-find:{day}` of the giver's day, reason `hug`. Because the key names the day, a second find that day returns the first and earns nothing: at most one find a day, counting successful finds, not rolls.
- **HH36 A hug find stops at rare.** A hug find always stores a cap at rare and draws common to rare (HH39), never epic or legendary, whatever `rarity-caps` says, plays the turn like any item, and pays no XP or coins at the turn.
- **HH37 Where the reward shows.** A hug sends nothing in Slack, as today. The bonuses arrive through the XP moment and App Home as any XP does, the hug find waits on the item board, and the hugs section's XP (HH30) includes the bonuses.
- **HH38 The hug XP numbers.** `hugXp`, the day bonus and the week bonus are the three numbers of the numbers table's hug rows: `hugXp = 1`, a day bonus that makes the first hug given each day 10 XP in all, and a week bonus that makes the first hug received each week 5 XP in all. The product owner approved them over 10 XP per hug, which would pay a heavy hugger 700 XP a week and a hug more than a kudos.

### Rarity (`rarity-caps`)

- **HH39 A draw has a cap.** The hoggie draw takes a `cap` beside its `floor`, and drops every rarity above the cap from the pools, as the floor drops those below. An item stores its floor and its cap when it is earned, and its weights by name (`base` or `kudos`); the turn reads them from the item.
- **HH40 Ownership never moves the odds.** A draw never drops a rarity because the member owns all of it. Within the drawn rarity, team and milestone items still prefer a hoggie the member doesn't own, and draw any when they own them all.
- **HH41 Only kudos reach epic and legendary.** While `rarity-caps` is on for the member when an item is earned, it stores these, from the numbers table: a kudos pack, no floor, no cap, `kudos` weights; the welcome item, exactly rare; level-up slots 1 and 2 capped at rare, slot 3 exactly rare; a completed team, exactly rare; a milestone, bronze uncommon to rare, silver, gold and diamond exactly rare; every quest's hoggie (onboarding, hug and kudos), a hug find, a feature opening and a bought crate, capped at rare. Every cap uses `base` weights within its range.
- **HH42 Earned before keeps its odds.** An item earned before the flag, or while it is off for the member, stores no cap and `base` weights, except a hug find, which is new and always capped (HH36), and draws as it would have, today's ownership rule included. So exclusivity holds for every item earned from the flag on, and an item waiting from before can still turn up an epic or legendary.
- **HH43 The forge stops at rare.** While `rarity-caps` is on for the member, the forge takes three spares of a common for an uncommon, or of an uncommon for a rare. A rare, epic or legendary shows no forge, and `forgeHoggie` refuses it (amends HF3 and HF8). A forge already earned turns as it was promised.
- **HH44 Where the odds show.** While `rarity-caps` is on for the member, the Book's cards (HH84) and the Leaderboard's next step (HH72) say what pays epic and legendary ("kudos are the only way to epic and legendary hoggies"). No surface shows percentages.

### Two quests a week (`two-quests`)

- **HH45 A hug quest and a kudos quest.** While `two-quests` is on for a member on the Monday path, each of their weeks (Monday 0:00 to Sunday in their time zone) holds exactly two quests: a hug quest and a kudos quest. They replace the three drawn quests of MQ8 and the wait of MQ9 for that member. Every surface that lists the week's quests lists these two, in that order.
- **HH46 The hug ladder.** A newcomer's hug quest is the next unfinished step of the hug ladder: `hugs-3` (`Give 3 hugs`), `hugs-5` (`Give 5 hugs`) and `hugs-10` (`Give 10 hugs`), each with the how-to `React to a teammate's message with :<kudos emoji>:.` All three become active together at the member's first week under `two-quests` and count the hugs the member gives from then on, so the 3rd, 5th and 10th such hug finish them, each once. Hugs given before the ladder was active count for nothing, which keeps the count in Quests' own records and lets no read race Leaderboard's count.
- **HH47 The kudos side of onboarding.** A newcomer's kudos quest is the next unfinished onboarding quest of MQ5, MQ46 and MQ47, unchanged: all three active at once, counted as they are today.
- **HH48 Drawn quests per side.** Once a side's onboarding is finished, that side's quest is drawn each week from its own pool: one per side and week, at the week's start or the next existing trigger (the hourly sweep, a kudos, a hug, the Monday DM's start), by today's rank hash and feasibility. A drawn quest not finished by Sunday is gone; an onboarding step carries over until it finishes.
- **HH49 The hug pool.** `hug-once` (`Hug a teammate's message`, 1 hug), `hug-two-days` (`Hug messages on 2 different days`, 2 of the giver's days) and `hug-ten` (`React to 10 messages this week`, 10 hugs). Each is feasible when the member's hug budget left today plus the budget of the week's remaining days reaches the target, and, for days, enough days remain.
- **HH50 The kudos pool.** `kudos-once` (`Give a kudos to someone`), `kudos-two-days` (`Thank someone on two different days`), `three-in-a-day` (`Thank 3 people in one day`), and today's `someone-new`, `two-new` and `not-in-30-days` with their wording. Any kudos counts. `three-in-a-day` counts distinct people thanked on one of the giver's days and is feasible while the daily allowance is at least 3 and, if today's kudos left are fewer than 3, a day remains.
- **HH51 The guardrails.** A hug quest counts at most 10 hugs or 2 days in a week; a kudos quest at most 3 recognitions, people or days. Every other guardrail stays: no person named, nothing received counted, nothing unshipped needed, at least one quest of each side feasible on the week's last day (amends Quests' "the pool keeps the guardrails").
- **HH52 Quests count recognition facts.** Two adapters turn each `kudosGiven` and each `hugGiven` into one recognition fact, `{ source, workspace, giver, people, kudos, message, day, at }`. A kudos names its recipients and its award count. A hug has `kudos: 0` and names its author when it has one, and nobody when it is on a kudos message, whose people were already counted. Each quest names what it counts: hugs, kudos, people or days. Quests reads neither award ids nor the gate decision for these quests.
- **HH53 The rewards.** Each onboarding kudos quest pays 50 XP and an unidentified Hoggie (MQ7, unchanged). Each hug ladder step and each drawn quest pays the XP in the numbers table and an unidentified Hoggie capped at rare (HH41), paid by `questFinished`'s followers (HH23, HH24).
- **HH54 The surfaces.** The Monday DM's quests section, the quests panel and Activity's quests box show the two quests as one checklist, the hug quest first, each row with its goal, its how-to and its reward. The `Getting started` journey (MQ38) gives way to the two quests on this path: the panel's eyebrow reads `This week's quests · n of 2`. The welcome keeps its card (MQ19, MQ48) and adds the hug ladder's next step as its first row.
- **HH55 One next quest.** Quests answers the member's next quest: the hug quest while it is unfinished, else the kudos quest, else nothing. Every surface that marks a quest as next takes it from that answer (seam with Silthus/personal#230).
- **HH56 The finish shows where it can.** A kudos quest's finish adds its line to the after-kudos reply (MQ12). A hug quest's finish sends nothing in Slack, since a hug never does: it shows in the XP moment's quest beat (LP104) and the next Monday DM.
- **HH57 Off is as before.** While `two-quests` is off for a member, their quests run as MQ5–MQ12 say, with HH13's pool. Turning it off keeps every finish and reward, and the member's next week is drawn the old way.

### The hype nudge (`hype-nudge`)

- **HH58 `Album` answers the nudges.** `nudgesFor(member)` answers the teammates whose hype emoji the member reacted with on that teammate's own messages (HH22's rows whose author is the owner) and doesn't hold, each with its emoji and how many such reactions, most reactions first, then the newest. A teammate who left, or whose emoji is no longer in the registry, is left out. It reads one index range by giver, and one entitlement read per owner it names.
- **HH59 One line in the Monday DM.** While `hype-nudge` is on for the member, the Monday DM carries one nudge line after the quests checklist, for the first teammate `nudgesFor` names: `Give <first name> a kudos to collect :<emoji>:.` With no teammate, no line. A DM with only a nudge isn't sent: a row whose hugs and quests sections are both empty is skipped as today (MQ24). `dm sent` names the `nudge` section when it went.
- **HH60 Rendered through `Feedback`.** The line is worded by `Feedback` and placed by the Slack adapter, as the other sections are.

### Activity (`activity-next`)

Accepted prototype: Silthus/personal#218, variant A; its element checklist is the build's `ui-walk` list.

- **HH61 One read.** While `activity-next` is on for the member, `/activity` reads `getActivityWeek`, which answers the member's next step (HH63), the week's two quests (HH45, or the panel's answer off that path), who thanked them this week (HH66) and last week's line (HH67). It reads this week's hugs received through Hugs' `hugsReceivedByDecision`, this week's kudos received through `Engine`'s reads, and counts through `totalsOf`, each one bounded index range.
- **HH62 The page.** Eyebrow `Activity`, title `Your week`. Under it, the next-step card with a Slack picture beside it; then `This week's quests · n of 2` beside `Who thanked you this week`; then the last-week line. The shell's quests panel hides on `/activity`. On a phone the card, the quests and the list stack in one column.
- **HH63 One next step.** The first that holds: **thanked**, a kudos received this week that the member can still hug back (posted less than 24 hours ago, not hugged by them, and a hug left in their budget today), the newest first: `Hug <first name>'s kudos back`, whose button opens that message's permalink in Slack, where the member's hug is a hug back (HH19); **empty**, a member who never gave a hug: `Give your first hug`, button `Open Slack`; **quiet**, everyone else: `Hug a message today`, saying the first hug each day pays extra XP while `hug-rewards` is on, button `Open Slack`. Each card has a way chip (`Hug · a reaction` or `Kudos · a message`), its title, one line on why with the kudos emoji, and exactly one button.
- **HH64 The Slack picture.** Beside the step, a teammate's message with one reaction of the workspace's kudos emoji, drawn by the website, never a real message.
- **HH65 The quests box.** One checkbox row per quest: a box, the goal, how to do it with the kudos emoji, and the reward; a finished quest ticks its box. No difficulty labels.
- **HH66 Who thanked you.** Every hug and kudos the member received this week, newest first, hugs and kudos together: the sender's face and name, `hugged your message`, `hugged your kudos back` or `gave you a kudos`, the day, and, for a kudos or a hug on a kudos message, the kudos words through `KudosMessage`; a hug on an ordinary message shows the sender and a link to the message, never its words. `Face` draws every face. Empty: `Nobody yet. Hugs and kudos you get show here, with who sent them.`
- **HH67 Last week.** One line with what the member gave and got last week and a `Read last week` link, which opens today's weekly issue for that week. No line for a member with no history. The week tabs and their sparklines are gone.
- **HH68 Off is as before.** While `activity-next` is off, `/activity` is today's weekly edition.

### Leaderboard (`leaderboard-hugs`)

Accepted prototype: Silthus/personal#219, variant A; its element checklist is the build's `ui-walk` list.

- **HH69 One read for this week.** While `leaderboard-hugs` is on for the member, `/leaderboard` reads `getBoards({ team })` over `boardsOf` for this week, with last week's rows for the comparisons. There is no period switch. Eyebrow `Leaderboard · this week`, title `Who's thanking who`.
- **HH70 The you card.** Face, name, level and XP bar (`Level 6 · 290 XP to level 7`), and four tallies: hugs given, hugs received, kudos received and hoggies found this week. A tally carries a green `+n` only when it beats last week.
- **HH71 Always a positive highlight.** A green ▲ line with a headline and one detail, the first that holds: the best week of hugs yet; `n more hugs than last week`; `n teammates thanked you this week`; `Last week you gave n hugs` (with `your best week yet` when it was); otherwise `Your thanks have reached n teammates`, the people the member ever hugged or thanked, from `Album`'s pair history by giver, one index range. Nothing negative shows.
- **HH72 One next step.** Beside the card, one card like Activity's (HH63), the first that holds: **lively**, the member gave this week: `Give <first name> a kudos`, for the first teammate `nudgesFor` names, else the teammate they hugged or thanked most this week, who always exists once they gave, saying it collects their hype emoji only when the member doesn't hold it yet and, while `rarity-caps` is on for them, that kudos are the only way to epic hoggies; **quiet**, someone gave the member a kudos that they can still hug back, as HH63 says: `Hug <first name>'s kudos back`, opening that message, as HH63's thanked step; **empty**, everyone else: `Give the first hug of the week`, button `Open Slack`.
- **HH73 The People board.** Measure chips `Hugs given`, `Hugged`, `Kudos received`, `Level`, `Hoggies`, the first chosen. Rows carry rank, face, name and the figure; equal figures share a rank; the member's row is tagged `You` and always shown; members who left the boards are on no board, their own view included (Leaderboard's rule, unchanged).
- **HH74 A fresh week.** When nobody has a figure this week: `This week starts fresh.` with how to be first, then `Last week` with its top three.
- **HH75 You in your team.** Beside People, `You in <team>` ranks the member among their primary team on the chosen measure (`You're No. 2 of 4 in Lanterns on hugs given this week`). On this week's measures it lists the teammates who joined in and the member, then `n more teammates can still join in this week` without names; on level and hoggies it lists the whole team. Before the member joins in: `Your first hug puts you on <team>'s board`, with `at the top` when nobody started.
- **HH76 Teams joining in.** A team is a counting group whose current primary members number at least 3, under today's group mode. Its score is the points it gained in the share of current primary members who joined in: `100 × (A_now − A_before) / N`, rounded to whole points, where A_now counts members whose this-week row has a `firstDay`, A_before counts members whose last-week row has a `firstDay` on or before the same weekday, and N is today's primary members (Silthus/personal#216). Teams with a gain above 0 are ranked, equal scores sharing a rank, each row with its crest, `A of N joined in`, a share bar and a green `+n pts`; the member's team is marked. Every other team folds under `n teams getting started`, unranked. No negative figure and no last place show. A team with no comparable last week (new, or before the backfill's first week) folds too.
- **HH77 Full teams and an empty race.** A team where everyone joined in gets one line, `Everyone in <team> joined in this week.` When no team has joined in yet: `No team has started yet. Start your team's week with a hug or a kudos.`
- **HH78 Emojis within your reach.** Up to three rows, each with its picture, `:name:`, how, and a progress bar: a teammate's hype emoji (`nudgesFor`'s first, give them a kudos), the member's team emoji (stickers to go) and the next level emoji (XP to go), each only when it exists.
- **HH79 Rows are links.** Every person row opens their person page and every team row their team page.
- **HH80 Slack ranks the same counts.** While `leaderboard-hugs` is on for the viewer, App Home's Leaderboard tab and `/hedgehug leaderboard` show the Everyone board ranked by hugs given, and the Groups board ranked by HH76's score with `A of N joined in`, both over `boardsOf`; their improvement lines and places climbed keep their rules on the new figures (amends Leaderboard's G13, GB12–GB18 invariants for those viewers). With the flag off they are as today.
- **HH81 Off is as before.** While `leaderboard-hugs` is off, `/leaderboard` reads `getThoughtfulBoards` as today, with HH15's wording.
- **HH82 The old boards retire with the flag.** While `leaderboard-hugs` exists, its off side stays as HH81 says. Retiring the flag is a later change that ends the rollback, deletes `getThoughtfulBoards`, `Album`'s boards and thoughtful givers, and drops the `thoughtfulBoardTallies` table and `Album`'s duplicate weekly counts (HH29). It is not part of this spec's stacks.

### The Book explains itself (`book-next`)

Accepted prototype: Silthus/personal#220, variant A; its element checklist is the build's `ui-walk` list.

- **HH83 The next five milestones.** While `book-next` is on for the member, `/book#me` shows `Next milestones` between the profile card and `Your album at a glance`: one tile per milestone ladder for its next medal, five at most, closest first by the share already done. Each tile has the ladder's emblem, the medal's name, `N to go` and a thin progress bar. On a phone the row scrolls sideways and the tiles keep their size. A ladder with every medal shows no tile.
- **HH84 The card.** Hovering or clicking a tile opens a card: the ladder's name with its medal, the medal's name, `How to get it` (hug and kudos wording per ladder), `What it pays` chips (the hoggie by HH41's rule, `An uncommon or rare hoggie` for bronze and `A rare hoggie` for the rest while `rarity-caps` is on, today's floor otherwise, and the medal's emoji; milestones pay no XP, so no XP chip), and one Slack button: `Hug a message in Slack` for the hoggies ladder, `Give a kudos in Slack` for the others.
- **HH85 Where the card goes.** It floats above the page, below or above its anchor, whichever fits between the top bar and the bottom of the screen, follows its anchor while scrolling and is never clipped by a scroll area. Hover opens it after a short grace period that lets the pointer move onto it; a click pins it; Escape, a click outside or `×` closes it.
- **HH86 A locked team page.** A team page still collecting shows under its header a progress bar, `Unlock the <team> sticker`, `n of m collected · k to go`, which opens the team card. The locked team sticker carries a `?` mark and opens the team card. A missing teammate's sticker is a button with a `How to get` hint on hover, and opens a card for that teammate: `Give <first name> a kudos: their sticker joins your album, and the team is k more from complete.` Collected teammates still link to their person page. Ready-to-unlock and unlocked team pages are as today.
- **HH87 The team card.** Who is left, each with `Give <first name> a kudos` opening Slack; `What the sticker pays` chips (a rare hoggie while `rarity-caps` is on, the `:team-<slug>:` emoji); `×` to close. It opens beside whatever was clicked.
- **HH88 The sidebar.** `Hoggies` and `Milestones`, with its medal count, sit at the top, above search, `Your team` and `Teams`. `Show N more` expands the teams in place, and `Show fewer ▴` sticks to the bottom of the expanded list. The open team stays in the collapsed list.
- **HH89 Off is as before.** While `book-next` is off, the profile, team pages and sidebar are as today.

### Instrumentation (no flag)

- **HH90 The reaction on a hug.** `hug given` gains `reaction`, the emoji name of the reaction that made the hug, from `hugGiven`'s new optional `reaction` field; a job from before carries none and the property is left out.
- **HH91 `activity viewed`.** `viewActivity({ state })`, a member mutation like `viewQuests`, records `activity viewed` with `state` (`thanked`, `empty` or `quiet`) once when the loaded page becomes visible on entry under `activity-next`; a rerender records nothing more, through the usage path, never blocking the page.
- **HH92 `leaderboard viewed` on the website.** `viewLeaderboard({ measure })` records `leaderboard viewed` with `surface: website`, `board: people`, `period: week` and the measure, once when the loaded page becomes visible on entry, with the first measure, and once more each time the member picks another measure; a rerender records nothing more. Silthus/personal#225 fixes why production records none today; this rule adds the website's own.
- **HH93 Where a visit came from.** Every link the app sends to the website carries `?src=<surface>`: `welcome`, `monday-dm`, `recap`, `app-home`, `reply`, `monday-post` or `link-card`. On load, before its first `$pageview`, the website reads `src`, removes it from the address without recording a page view, and records that page view with `source` set to it; with none, `source` is `direct`. Later page views of the visit carry no `source`. This amends MQ22 and MQ36's "no tracking parameter": the parameter carries the surface only, never a member.
- **HH94 The bars read them.** The map's usage bars and the "Hugs are the hook" dashboard row (Silthus/personal#222) read these events; no new dashboard is part of this spec.

### The numbers

One table for every XP amount and drop odd this spec sets, approved by the product owner on 2026-10-29 as the rarity research (Silthus/personal#215) recommended. Percentages are rounded; weights within a capped range are today's base weights, renormalized.

| # | What | Today | Approved |
| --- | --- | --- | --- |
| 1 | Hug given, `hugXp` for the giver | 1 XP | 1 XP |
| 2 | First hug given each day, in all | 1 XP | 10 XP (a 9 XP day bonus) |
| 3 | Hug received, `hugXp` for each person | 1 XP | 1 XP |
| 4 | First hug received each week, in all | 1 XP | 5 XP (a 4 XP week bonus) |
| 5 | Kudos, per award: giver / recipient | 10 / 5 XP | unchanged |
| 6 | Kudos pack, at its turn | 15 XP, thoughtful kudos only | 15 XP, any kudos |
| 7 | Onboarding kudos quest (3) | 50 XP + a hoggie | unchanged |
| 8 | Hug ladder step (3, 5, 10 hugs) | none | 20 XP + a hoggie each |
| 9 | Drawn hug quest, drawn kudos quest | 20 XP + a hoggie (kudos only) | 20 XP + a hoggie each |
| 10 | Milestones, completed teams | no XP | no XP |
| 11 | Hug find | none | 20% per hug given, at most one find a day |
| 12 | Hug find rarity | none | common 54%, uncommon 30%, rare 15% |
| 13 | Kudos pack rarity | 50 / 28 / 14 / 6 / 2% | 50 / 28 / 18 / 3.5 / 0.5% |
| 14 | `Welcome` item | rare floor: rare 64%, epic 27%, legendary 9% | exactly rare |
| 15 | Level-up slots 1 and 2 | 50 / 28 / 14 / 6 / 2% | common 54%, uncommon 30%, rare 15% |
| 16 | Level-up slot 3 | rare floor: 64 / 27 / 9% | exactly rare |
| 17 | Completed team | rare floor, rarer once every rare is owned | exactly rare |
| 18 | Milestone, bronze | uncommon floor: 56 / 28 / 12 / 4% | uncommon 67%, rare 33% |
| 19 | Milestone, silver / gold / diamond | rare / epic / legendary floor | exactly rare |
| 20 | Quest hoggies, feature openings, bought crates | 50 / 28 / 14 / 6 / 2% | common 54%, uncommon 30%, rare 15% |
| 21 | Forge, three spares | one rarity up, up to legendary | common → uncommon and uncommon → rare only |
| 22 | A fully owned rarity | team and milestone draws skip it, so odds rise | never changes the odds |
| 23 | `Items` earned before the change | — | keep the odds they were earned with |

What hugs alone pay in a week, on the rarity research's synthetic members (levels: 2 at 20 XP, 3 at 100, 4 at 300, 5 at 600):

| Member | Hugs given / received a week | Approved | At 10 XP per hug |
| --- | --- | --- | --- |
| Light | 2 on 2 days / 2 | 26 XP | 40 XP |
| Typical | 10 on 5 days / 5 | 64 XP | 150 XP |
| Heavy | 50 on 5 days / 20 | 119 XP | 700 XP |

A kudos to one person pays its giver 25 XP (10 XP and the pack's 15). With these numbers one kudos is worth a day's first hug and more; at 10 XP per hug, a heavy hugger would reach level 5 in their first week. The research's 12-week chance of any legendary for light / typical / heavy members falls from 65% / 91% / 100% today to 3% / 12% / 46% with row 13, against 11% / 40% / 91% had today's kudos odds stayed.

## Walks

The repo has no `e2e.config.ts`, so these walks stay in the spec and the stack that completes each journey follows them by hand for its `ui-walk` proof, naming each screenshot with its stage label (`orchestration-wayfinder` WALKS).

**Activity, a newcomer** (HH61–HH67):

```ts
test("A newcomer's Activity offers one next step and the week's quests", async ({ agent, app }) => {
  await agent.act("Sign in as a member who has never given a hug and open Activity");
  await agent.waitFor("the Activity page titled Your week has loaded");
  await agent.assert("one next-step card reads Give your first hug with a single Open Slack button");
  await app.screenshot("A newcomer sees one next step: give your first hug");
  await agent.assert("This week's quests shows 0 of 2 with a hug quest first and a kudos quest second, neither with a difficulty label");
  await agent.assert("Who thanked you this week reads Nobody yet");
  await app.screenshot("The week's two quests sit beside an empty thanks list");
});
```

**Activity, thanked** (HH63, HH66):

```ts
test("A thanked member hugs the kudos back from Activity", async ({ agent, app }) => {
  await agent.act("Sign in as a member who received a kudos from Fen this week and open Activity");
  await agent.waitFor("the Activity page titled Your week has loaded");
  await agent.assert("the next-step card reads Hug Fen's kudos back");
  await agent.assert("Who thanked you this week lists Fen with gave you a kudos and the kudos words");
  await app.screenshot("A thanked member is asked to hug Fen's kudos back");
  await agent.act("Press the next-step card's button");
  await agent.assert("the button's link is the Slack permalink of Fen's kudos message");
  await app.screenshot("The button opens Fen's kudos in Slack");
});
```

**Leaderboard** (HH69–HH79):

```ts
test("The Leaderboard leads with you and ranks hugs", async ({ agent, app }) => {
  await agent.act("Sign in as a member who gave hugs this week and open the Leaderboard");
  await agent.waitFor("the page titled Who's thanking who has loaded");
  await agent.assert("the you card shows a green highlight line and tallies for hugs given, hugs received, kudos received and hoggies, with no negative number");
  await app.screenshot("The member sees themselves first with a positive highlight");
  await agent.act("Choose the Kudos received measure on the People board");
  await agent.assert("the People board ranks by kudos received and the member's row is tagged You");
  await app.screenshot("The People board ranks by kudos received");
  await agent.assert("Teams joining in lists teams with A of N joined in and a green points gain, and no team is shown as last");
  await app.screenshot("Teams race on teammates joining in");
  await agent.act("Click a team row in Teams joining in");
  await agent.waitFor("a team page has loaded");
  await app.screenshot("A team row opens its team page");
});
```

**The Book's next milestones** (HH83–HH85):

```ts
test("A milestone tile explains what it takes and pays", async ({ agent, app }) => {
  await agent.act("Sign in as a member with milestones in progress and open the Book's profile at /book#me");
  await agent.waitFor("the Next milestones row has loaded");
  await agent.assert("Next milestones shows up to five tiles, each with a medal name, N to go and a progress bar");
  await app.screenshot("The next five milestones sit under the profile card");
  await agent.act("Click the first milestone tile");
  await agent.assert("a card shows How to get it, What it pays with a hoggie chip, and one Slack button, fully visible on screen");
  await app.screenshot("A milestone card says how to get it and what it pays");
  await agent.act("Press Escape");
  await agent.assert("the card is closed");
});
```

**A locked team page** (HH86, HH87):

```ts
test("A locked team page explains how to complete it", async ({ agent, app }) => {
  await agent.act("Sign in as a member and open a team page that is still collecting");
  await agent.waitFor("the team page with a progress bar reading Unlock the sticker has loaded");
  await agent.act("Click a missing teammate's sticker");
  await agent.assert("a card says Give that teammate a kudos, their sticker joins your album, and how many more the team needs");
  await app.screenshot("A missing sticker explains how to collect that teammate");
  await agent.act("Close the card and click the progress bar");
  await agent.assert("a card lists who is left, each with Give a kudos, and what the sticker pays");
  await app.screenshot("The progress bar explains who is left and what the team pays");
});
```

**The sidebar** (HH88):

```ts
test("The sidebar puts Hoggies and Milestones first and expands teams in place", async ({ agent, app }) => {
  await agent.act("Sign in as a member in a workspace with more teams than the sidebar shows and open the Book");
  await agent.assert("Hoggies and Milestones sit above search and the teams in the sidebar");
  await app.screenshot("Hoggies and Milestones lead the sidebar");
  await agent.act("Press Show more under the teams");
  await agent.assert("every team shows in place, Show fewer sits at the bottom of the list, and Hoggies and Milestones are still visible");
  await app.screenshot("Show more expands the teams in place");
});
```

## Testing Decisions

- **A good test** drives the product from the outside: a signed Slack event, a cron tick on a fake clock or a website session's call goes in, and what the member observes comes out (the Slack message, the website's answer, the captured PostHog event, the XP and items a website read answers). It never reads a table to prove what a member could observe.
- **The backend from Slack to the website.** One convex-test backend per test, with the signed Slack boundary, the fake Slack and the fake PostHog from `testing/`, flags from the fake PostHog, the clock faked across days and Mondays, and a signed-in website session. Prior art: `convex/slack/mondayDmHugs.test.ts`, `convex/quests/mondayPath.test.ts`, `convex/quests/weekly.test.ts`, `convex/website/album.test.ts`, `convex/website/mondayQuests.test.ts`, `convex/welcome/welcome.test.ts`, the leaderboard's board tests.
- **The website shell with fixture reads.** The album shell rendered with fixture reads under `@testing-library/react` and jsdom: the Activity page's three states, the Leaderboard's measures and its empty and full-team lines, the Book's row, cards and sidebar, and the `viewActivity` and `viewLeaderboard` calls. Prior art: `website/src/album/questsPanel.test.tsx`, `website/src/album/home.test.tsx`, `website/src/album/hoggies.test.tsx`.
- **Nothing new to test through.** Both exist. The guard test of HH16 is a test of the code's imports, beside `convex/publicSurface.test.ts`. A ticket that cannot test through these two names why in its pull request.
- **Delivered twice.** Every subscriber HH16–HH38 adds is tested from Slack to the website by delivering its fact twice: one XP payment, one count, one find, one hype row, one finish.
- **The hug back.** A signed reaction from a recipient on the kudos they received pays the kudos' author one hug, which counts on the boards and for quests; the author's own reaction still does nothing. The thanked walk below ends in Slack, so this test proves what the walk can't.
- **Numbers as data.** XP amounts and odds come from one constant each, and the tests read them, so the approved table changes one place. A draw test runs the real draw over many keys and checks every capped kind never answers above its cap, and a kudos pack can.
- **The flags' two directions.** Each flag's tests show its off side unchanged: no bonus, no find, old odds, three drawn quests, no nudge, today's Activity, Leaderboard and Book.
- **Look and phones are proofs, not tests.** Each page is checked against its prototype's element checklist at 1280 px and a phone width, and each walk above is followed by hand.

## Out of Scope

- **Boosters**: more XP the more hugs a day, and timed windows with better odds. Fog on the map, low priority; past designs in ADR-0003, ADR-0004 and the core loop's deferred list.
- **LLM thank-you detection** and an "edit this into a kudos" nudge: waits on LLM gateway access.
- **Feeding the Monday all-hands** from kudos: fog on the map.
- **Collecting a hype emoji by reactions** (Silthus/personal#228) and **admins setting every member's hype emoji** (Silthus/personal#229): their own tickets, on HH22's rows.
- **The quests panel's Next** (Silthus/personal#230), **the recap's delivery moving to Monday DM** (#231), **`Welcome`'s and Achievements' hoggies on the bus** (#232), **deleting the legacy quest finish** (#233), and **the existing subscribers made safe to replay** (#235, #236, #237): their own tickets.
- **Leaderboard errors and the missing `leaderboard viewed`** (#225) and **the recap mismatch** (#227): side fixes in flight.
- **Recounting the kudos milestone** from kudos given before HH9: tiers move from the next kudos on.
- **A period switch, "Who gave" and "Show everyone"** on the Leaderboard, **the awards wall and lane race**, and **week tabs** on Activity: cut by the prototypes for low use.
- **The "Not found yet" placeholders' card** on the hoggies page: a later slice of the Book.
- **Merging `Engine` and Hugs** into one module, and **renaming the leaderboard totals**: the architecture's not-now and maybe.
- **Forge uses for rare, epic and legendary spares**, such as a same-rarity reroll.
- **Odds shown as numbers** on any surface.
- **Capturing ordinary Slack messages' words** for Activity: only kudos words are stored and shown (HH66).
- **Retiring the flags** and deleting their off paths, the old boards among them (HH82).
- **Deleting the gate decision** or its classifier: it stays stored (ADR-0004).

## Further Notes

- **Inputs this spec resolves where they disagreed** (🤖):
  - Hug finds follow the hug given, not the hug received (HH35): the rarity research's recommendation, against the architecture's `hugReceived` follower. The giver is the habit the map wants, and a hug on a kudos message would fan finds out to every recipient.
  - The hug ladder counts hugs from the moment it is active (HH46), in Quests' own records, so it needs no new state and no read of another module's count; members who already hug start it at 0.
  - The `Getting started` journey gives way to the two quests (HH54), so every surface lists the same two.
  - Milestones pay no XP (HH84): the Book prototype's XP chip was a placeholder, and today they pay none.
  - The team score counts `firstDay` per member and period (HH26, HH76), so "the same elapsed window last week" is one field and the comparison is by the member's own weekday.
- **Complexity.** The spec pass (GPT-6.1 Sol, high, 2026-10-29, Anti-Overengineering) cut nothing and found six gaps, now in the rules: deleting the old boards at 100% would break the flag's rollback, so they retire with the flag in a later change (HH82); Quests' new finish record needed a seed and its readers switched (HH24); `Album` kept its own weekly kudos and hug counts beside Leaderboard's, so the weekly issue reads `totalsOf` and those counts retire with the flag (HH30); "the hugged message's words" would have meant storing ordinary Slack messages, so a hug on an ordinary message shows a link instead (HH66, Out of Scope); pages choose their variant in a query without writing and expose in their view mutation (HH4); and view events record once per visible page, not per render (HH91, HH92). No part of the spec was kept against a finding.
- **Retiring the flags** and deleting their off paths are later changes, one per flag, once the product owner keeps the change.
