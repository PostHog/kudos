# Leaderboard

Leaderboard: totals per member by day, week, month and all time of the kudos they gave, the kudos they received, the hugs they gave and the hugs they received, each count landing in the member's own day, week and month in the time zone the directory holds when it is counted (UTC without one), each week, month and all time total with `firstDay`, the member's first day in the period on which they gave a hug or a kudos, and each week and month total keeping its running total of kudos given by day of the period (HH26), and beside each week and month total with hugs given its running total of hugs given by day in a table of its own, started only with the period's first hug so a total counted before it shipped waits for the fill (HH80), read for the viewer's own week, month or all time through one index range of the workspace's totals by boardsOf, which ranks people by each of the four counts, sums each company team, leaves off members who left the boards and pins the viewer, read for no viewer too, and by placeOf, one member's place by the kudos they gave (HH28), so the player card reads its place this week through placeOf and the link card a person's and a team's all-time place and kudos given, and who on a team said thanks, through boardsOf for no viewer (HH29), and by totalsOf, one member's totals for one period in one read, so the player card reads a teammate's hugs given and received in their own week, the weekly issue its kudos and hugs given and received in the member's own week, and hugXpOf the week's hugs given and received for the hugs recap (HH30); fed by the kudosGiven subscriber, which counts the giver once per message and each recipient once per award, 100 recipients to a mutation, each mutation scheduling the next, by the hugGiven subscriber once per giver and message and the hugReceived subscriber once per person, giver and message, each keyed in the counted table so a redelivered fact counts nothing twice, by a one-off backfill of the awards given before it shipped, by a one-off backfill of the kudos received, hugs given, hugs received and `firstDay` from the stored awards and the hugs and the people each hug paid, through the same keys, one page of 100 to a mutation, so it counts what the subscribers would have and running it again counts nothing (HH27), and by a one-off fill of the running totals, kudos and hugs, of the totals counted before they shipped, and the Everyone board for this week, this month or all time, ranked and windowed by a pure board function, with the viewer's improvement line against the previous period up to the same day, read from one totals row per member of that period, worded once by improvementLine for Slack and the website; where `leaderboard-hugs` applies to the viewer, App Home's Leaderboard tab and the `/hedgehug leaderboard` reply rank the Everyone board by hugs given instead, its rows, join nudge, improvement line, places climbed, best completed period and peer line counted in hugs given, the comparison read from those running totals of hugs given, or from the days of the previous period while any total with hugs given lacks one or has one that falls short of it, as a rollback that counted hugs without them leaves it, which the fill makes whole, with one exposure from the mutation that decides what the viewer sees, and the reply's Groups board is the website's teams joining in for this week only (teamsJoiningInOf): teams with a gain above 0 ranked by points gained in the Groups board's window (the top three, or the first ten, or the top three and the three on each side of the viewer's team), each `A of N joined in` with the viewer's team marked, the rest counted as teams getting started, a line for each team in the window where everyone joined in, so a long week stays one window long, and one while no team has started, with no improvement line, places climbed or most improved group, and no Groups board for `month` and `all` (HH80); and the same board whole for the website through rankedBoardOf (every ranked member with their position, rank and tie, their places climbed against that same comparison, and the picture the directory holds for them, the window's positions, and the viewer's standing), and each member's `Show me on the leaderboards` setting, which leaves them off every board and, when it changes, schedules the engine's spotlight recompute of the kudos that member gave or received. The board ships behind the flag `everyone-board`, safe default off: its totals count while the flag is off, and a member sees the board, the App Home tabs or the `/hedgehug leaderboard` reply only while it is on in their member decision (a caller the directory doesn't know: the workspace decision) and, while `xp-levels` and `unlocks` are on, only once they have opened the Leaderboard (G23, G42 under P76), though they appear on the board others see either way, with one exposure per member and value from the mutation that decides what they see. Beside them it keeps the group totals: one row per group, member and period with the period's running total by day for a week or month, fed only by the awardsAttributed subscriber, once per kudos message and never for a message that counts for no group; beside them, each group's kudos attributed in each week, month and all time, with the week's or month's running total, so the board reads a group's kudos, its comparison and its best completed period one row per period. They are recorded whatever any flag says. The Groups board reads them: above the Everyone board in the Leaderboard tab and the `/hedgehug leaderboard` reply, where `groups` applies to the viewer and groups are available, and behind the Everyone board's own flag and unlock, it ranks every counting group that is the current primary group of at least 3 members by the kudos attributed to it in the period per current primary member (one decimal), then by participation (a whole percent rounded down), total and name, groups equal on all three sharing a rank, windowed like the Everyone board around the viewer's primary group, each row with its places climbed against the previous period up to the same day. Under it, for a week or month, the viewer's group gets its gain per person with the places it climbed, or its best completed period per person, and the listed group with the largest gain is named most improved; no line states a loss. One pure function computes it, so Slack and the website (through groupBoardsOf) show the same numbers, and `leaderboard viewed` names the Groups board beside the Everyone board wherever it shows. The My group board reads them too: between the Groups and Everyone boards, under the same conditions and only for a viewer whose current primary group counts, it ranks the members whose current primary group is the viewer's by the kudos they gave attributed to that group in the period, with the Everyone board's rules (members only, `Show me on the leaderboards`, ties, the window and the lines for a viewer who isn't on it or left it), each row with its places climbed, reading the group's totals through its two group-and-period ranges, shared with the Groups board in groupBoardsOf; Slack reads it in a query of its own under the group's name, the website through groupBoardsOf, and `leaderboard viewed` names it wherever it shows. Right after the Everyone board's improvement line, for a week or month, where `groups` applies and the viewer's primary group counts and has at least 3 other current primary members, a viewer whose gain over all kudos given is above 0 and larger than the gain of more than half of those members gets the peer line with the share of them whose gain is smaller, rounded down to a multiple of 10, which rankedBoardOf gives the website too. The Monday post reads them too: where `monday-post` applies to them, groups are available and an announcement channel is set while `xp-levels` applies in the workspace decision, as the Admin tab that shows the switch needs, an admin switches it on or off and picks its time zone, by default the switching admin's own (setMondayPost), and the maintainer, while `workspace-settings` applies to them, switches it on or off through the same setMondayPost from the website's Settings, which shows the announcement channel as a Slack link and the time zone a switch on uses, the stored one while it is on and the maintainer's own while it is off, and each change bumps its generation and schedules the post for the next Monday 9:00 in that zone. While `weekly-post-channel` applies in the workspace decision, the maintainer also picks the post's own channel in those Settings by pasting a channel's link or ID (pickMondayPostChannel, from the website only): the Slack adapter joins the channel, and only a public channel it joined is picked, under the name Slack gave, so the post, its switch, the Admin tab and Settings use it in place of the announcement channel, which still carries the level-up celebrations; while none is picked, or the flag is off, the post goes to the announcement channel. When the job runs at the generation it carries, one mutation schedules the next Monday unless that Monday's job is already scheduled, so a claim that fails can't end the weekly chain, and then another checks that 9:00 has come on the workspace's week's Monday in that zone and that the week is not claimed yet, and checks `monday-post` and `xp-levels` in the workspace decision, groups' availability and the post's channel before it claims the week and reads last week's Groups board, from Monday to Sunday of the allowance days, with up to its first three groups that got kudos, each with its rank and kudos per person, its most improved group, and how many members gave kudos last week; so a job from before a switch or time zone change, a job that runs before 9:00, a second job for a claimed week and a week nobody gave post nothing, and a time zone changed after this week's post moves next week's. A post Slack never received, held back or refused for its rate limit, gives the week back and is tried again once Slack allows it, three requests at most, a hold using up none; otherwise the claim records whether the post went out, couldn't be posted (I'm not in the channel, it's gone or archived, or Slack refuses posting there) or got no answer, and a post is never sent again that week. The groups post names groups only, never a member, and reads each counting group's rows of the two weeks through one index range per group and week, never one per member, so a workspace of 4,200 members in 60 groups claims its week within Convex's transaction limits.

## invariants
- the leaderboard counts kudos given, never kudos received: A board ranks members by the kudos they gave in the period, or by the hugs they gave where `leaderboard-hugs` applies to the viewer (HH80), and the kudos and hugs a member received, counted beside them (HH26), never add to the count they are ranked by, put them on a board or give them a line.
  over: the totals and this week's Everyone board after one member gives kudos to two others in one message and one of them gives kudos back, seen by the member who only received
  via: G13: the board counts kudos given, never kudos received
  because: the leaderboard rewards what a member controls, giving (G13, G15); counting kudos received would turn it into the popularity contest the groups spec rules out and rank most people at the bottom of a list they can't climb
  refuted: countKudosGiven also added each award's kudos to its recipient's period totals -> the test failed on its board assertion, with the member who gave back at 4 and the member who only received ranked 3rd with 3 (2026-10-13)
  kinds: state
  checklist: revalidated-permission dismissed: counting needs no permission; the subscriber runs on the engine's own kudosGiven event, and the board query reads only totals
  checklist: separation-of-duties dismissed: no approval policy applies to counting kudos or showing a board
  checklist: legal-state-succession dismissed: a total only grows by addition; no actors compete for a terminal decision about one subject
  checklist: supersession-safety dismissed: every count adds to a total and nothing displaces a later value; Convex serializes the mutations that touch one total row
  checklist: worker-fencing dismissed: each subscriber run is one serialized mutation; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: counting issues no external effect; the board is read when a member asks for it
  checklist: resumption-coverage dismissed: this invariant is about which kudos count, not about a batch; the backfill's resumption is covered by every award counts once, live or backfilled
- the improvement line never states a loss: The viewer's line under a board reports kudos gained, or hugs gained where the board ranks hugs given (HH80), and places climbed, never kudos, hugs or places lost; without a gain it names their best completed period, or nothing.
  over: the improvement line of a viewer who gave fewer kudos than last period up to the same day, or kept a gain while falling in position
  via: G18: the improvement line
  because: the line is there to encourage (G18); a line that told a member they gave less, or dropped places, would turn a private nudge into a reproach
  kinds: state
  checklist: revalidated-permission dismissed: the line is computed for the viewer from totals when they ask; no permission applies
  checklist: separation-of-duties dismissed: no approval policy applies to showing a member their own progress
  checklist: legal-state-succession dismissed: the line is derived on every read and holds no state of its own
  checklist: supersession-safety dismissed: the line is derived on every read; nothing is written that a later value could displace
  checklist: worker-fencing dismissed: one read-only query computes the line; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: computing the line issues no external effect
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the line is computed in one query
- a member who left the boards is on nobody's board: A member whose `Show me on the leaderboards` setting is off is on no viewer's Everyone board for any period, their own included, which says `You're not on the leaderboards. You can change that in Settings.` in place of their rows and keeps their gain line without places; turned on again, they are back.
  over: this week's, this month's and all time's Everyone board seen by the member who turned the setting off and by another member, through `/hedgehug leaderboard` and the Leaderboard tab
  via: G22: a member who left the boards is on nobody's board, their own included
  because: leaving the boards is the member's own choice (G22); a board that still listed them, to anyone, would show the standing they asked to keep private
  refuted: entryOf no longer left out the members whose setting is off -> the test failed on the other member's board, with the member who left ranked 1st with 3 (2026-10-13)
  kinds: state
  checklist: revalidated-permission dismissed: the setting is read on every board, in the query that renders it
  checklist: separation-of-duties dismissed: no approval policy applies to a member leaving or rejoining the boards
  checklist: legal-state-succession dismissed: the setting is on or off; the command sets it to the value the clicked button carries, so a repeated click changes nothing
  checklist: supersession-safety dismissed: the latest click wins; Convex serializes the mutations that write one member's setting row
  checklist: worker-fencing dismissed: one serialized mutation writes the setting; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: the board is read when it is viewed; App Home is published after the setting commits
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the setting is one row per member
- every award counts once, live or backfilled: The totals count each Given message's awards exactly once, whether the kudosGiven subscriber or the backfill of earlier kudos reaches the message first, and however often either runs.
  over: the totals after the backfill counts one earlier award, is interrupted, a member gives kudos while it is stopped and the subscriber counts them, and the backfill runs again over every award
  via: G44: an award given while the backfill runs counts once
  because: G14 counts every award given before the leaderboard shipped and G44 counts each award once; the backfill and the subscriber both reach awards given while it runs, and a second count would rank that giver above what they gave
  refuted: countGiven no longer skipped a message its countedKudosGiven row marks as counted -> the test failed on its board assertion, with the kudos given while the backfill was stopped counted twice for their giver (2026-10-13)
  kinds: state
  checklist: revalidated-permission dismissed: counting needs no permission; the backfill is an internal function the ship ticket runs once from the CLI
  checklist: separation-of-duties dismissed: no approval policy applies to counting kudos
  checklist: legal-state-succession dismissed: a message is counted or not; the countedKudosGiven row is written in the same transaction as the totals it adds to
  checklist: supersession-safety dismissed: every count adds to a total and nothing displaces a later value; Convex serializes the subscriber's and the backfill's mutations on one message's countedKudosGiven row
  checklist: worker-fencing dismissed: each page of the backfill and each subscriber run is one serialized mutation; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: counting issues no external effect
  checklist: resumption-coverage dismissed: the backfill keeps no checkpoint; a resumed run starts again from the first award, and every message it already counted is skipped by its countedKudosGiven row
- the Everyone board is invisible while everyone-board is off: Without the flags key, without an everyone-board flag in PostHog, or in production while the flag is on in the sandbox only, `/hedgehug leaderboard` does what `/hedgehug` does, App Home shows only the member's own kudos, without tabs, and a button left from while the flag was on changes no setting and republishes App Home without tabs.
  over: `/hedgehug leaderboard month` and App Home opened in each of the three off states, and a Leaderboard and a Settings click left from App Home published while the flag was on
  via: #83: the Everyone board is invisible while everyone-board is off
  refuted: isEveryoneBoardShownTo answered true without reading the everyone-board flag -> all 7 tests under the describe failed on their assertions, the command answering with the board and App Home showing its tab bar (2026-10-13)
  because: every new member-facing slice reaches production behind a flag whose safe default is off (the owner's rule, 2026-10-13; O33), so with the flag off a member must see exactly the core loop's App Home and `/hedgehug`, and nothing of the board
  kinds: message, state
  checklist: revalidated-permission dismissed: the flag is read for the workspace in the mutation that decides what the member sees, on every command, opening and click
  checklist: separation-of-duties dismissed: the flag is switched in PostHog by the owner, outside this deployment
  checklist: legal-state-succession dismissed: the gate writes no board state of its own; while off, a click writes no selection or setting
  checklist: supersession-safety dismissed: the flag value is read fresh on every request; nothing stored records it except the exposure, which is per value
  checklist: worker-fencing dismissed: one mutation reads the flag and decides; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: App Home is published after the mutation that read the flag commits; the command replies after its mutation returns
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the totals the board reads keep counting while it is off
  checklist: destination-confinement dismissed: the gate adds no destination; the command still answers its own response or `/hedgehug`'s, and App Home is published to the member who opened or clicked it
  checklist: message-authenticity dismissed: every command, event and click is verified by the Slack signature before the gate is reached
  checklist: input-validation dismissed: the gate reads only the workspace and user Slack sent; the command's arguments and the click's command are validated as before
  checklist: retry-recognition dismissed: a redelivered event or click is recognized by its receipt before the gate runs, and the gate itself changes nothing a retry could repeat except the exposure, which is deduplicated
  checklist: duplicate-suppression dismissed: one exposure per member, flag and value, deduplicated in the mutation that sends it (O36)
  checklist: keyed-ordering dismissed: the flag is read fresh on every request, so the order of requests does not change what a later one sees
  checklist: acknowledgment-barrier dismissed: the command acknowledges with its reply or `/hedgehug`'s empty 200, and events and clicks are acknowledged before the gate runs in their scheduled functions
  checklist: retry-classification dismissed: reading the flag never throws (O33); a failure to read answers the safe default, so the gate adds no failure to classify
- a board row never states a drop: Every ranked row of the Everyone board carries its places climbed against the previous period up to the same day, a positive number, and nothing when the member fell, stayed, wasn't on that board then, or the period is all time; a member who left the boards is compared on no board, their own view included.
  over: this week's, this month's on a 31st and all time's Everyone board through rankedBoardOf, with members who rose, fell, stayed and are new, and a viewer who left the boards
  via: GB18: places climbed
  because: the website shows rank-change arrows to encourage (GB18, user story 46); a row that said how far a member dropped would turn the board into the reproach the groups spec rules out (G18)
  refuted: placesClimbed gave every row that was on last period's board its position before minus its position now, a fall or a stay included -> 3 of the 4 tests failed, the member who fell from 2nd to 3rd reading -1 (2026-10-14)
  kinds: state
  checklist: revalidated-permission dismissed: the places are computed for the viewer from totals when they ask; no permission applies
  checklist: separation-of-duties dismissed: no approval policy applies to showing a board
  checklist: legal-state-succession dismissed: the places are derived on every read and hold no state of their own
  checklist: supersession-safety dismissed: the places are derived on every read; nothing is written that a later value could displace
  checklist: worker-fencing dismissed: one read-only query computes the board; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: computing the places issues no external effect
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the board is computed in one query
- the Everyone board reads within Convex's limits: A board and its comparison with the previous period up to the same day read one totals row per member for each of the two periods and one directory row and one setting per ranked member, so a workspace of 1,500 members who each gave every day for two months reads its month board within Convex's transaction limits.
  over: the month board on October 31st of a workspace of 1,500 members who each gave kudos every day of September and October, read through rankedBoardOf with Convex's transaction limits enforced
  via: GB35: the Everyone board at scale
  refuted: the comparison added up each member's day rows of the previous period instead of reading the running total on their one totals row -> the test failed on Convex's limit, too many index ranges read in a single function execution (2026-10-14)
  because: the comparison used to add up every member's day rows of the previous period, which at a large workspace near a month's end reads more documents than one Convex query may, and a board that throws shows nobody anything (GB35, call 16)
  kinds: state
  checklist: revalidated-permission dismissed: the board is read for the viewer from totals when they ask; no permission applies
  checklist: separation-of-duties dismissed: no approval policy applies to reading a board
  checklist: legal-state-succession dismissed: the read writes nothing; a running total only grows by addition
  checklist: supersession-safety dismissed: the read writes nothing; Convex serializes the mutations that add to one totals row
  checklist: worker-fencing dismissed: one read-only query reads the board; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: reading the board issues no external effect
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the board is read in one query
- every day counts once in a running total, live or filled: The running total of a week or month total holds each day's kudos once, whether the kudosGiven subscriber added them after it shipped or the fill computed it from the day totals, and a total counted before it shipped, counted again live before the fill, compares the same before and after the fill, which a second run leaves unchanged.
  over: the running totals and this week's improvement line of a member whose totals were counted before running totals shipped, who gave kudos live before the fill, filled in pages of one, and filled again
  via: GB35: running totals for the totals counted before they shipped
  refuted: a live count on a total without a running total started one from that count alone, which the fill then skipped -> the test failed on its running totals, the week holding only the live kudos (2026-10-14)
  because: the comparison with the previous period reads only the running total (GB35); a day counted twice, or left out because a live count started a running total the fill then skipped, would show a member a gain or places they didn't make
  kinds: state
  checklist: revalidated-permission dismissed: the fill is an internal function the ship ticket runs once from the CLI; counting needs no permission
  checklist: separation-of-duties dismissed: no approval policy applies to counting kudos
  checklist: legal-state-succession dismissed: a total has a running total or not; the fill writes one only where there is none, in the transaction that reads the day totals it adds up
  checklist: supersession-safety dismissed: Convex serializes the fill's and the subscriber's mutations on one totals row and its day totals, so neither overwrites the other's addition
  checklist: worker-fencing dismissed: each page of the fill and each subscriber run is one serialized mutation; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: filling issues no external effect
  checklist: resumption-coverage dismissed: the fill keeps no checkpoint; a resumed run starts again from the first total and skips every total that has a running total
- a group total never exists without its attribution: Every group total is the sum of the attributions for its group, member and period, running total included, and each group's week and month kudos the sum of its attributions in that period, however often kudosGiven or awardsAttributed are delivered and in whichever order the subscribers run.
  over: every group total after kudos messages attributed twice and counted before, during and after their scheduled awardsAttributed, a giver who changed group in between and a giver without a group
  via: GB12: group totals follow attribution
  refuted: countAwardsAttributed added a message's kudos on every delivery of awardsAttributed without checking or leaving its counted mark -> the test failed, the group totals no longer the sum of their attributions (2026-10-14)
  because: the group boards and the Monday post rank groups by these totals (GB12, GB13, GB28); a total counted twice, or fed from kudosGiven beside the attribution, would credit a group with kudos its attributions never gave it
  kinds: state
  checklist: revalidated-permission dismissed: counting needs no permission; the subscriber runs on Groups' own awardsAttributed event
  checklist: separation-of-duties dismissed: no approval policy applies
  checklist: legal-state-succession dismissed: a group total only grows by an attribution's kudos
  checklist: supersession-safety dismissed: the counted mark per message and the totals it adds to commit in one mutation, so a second delivery finds the mark
  checklist: worker-fencing dismissed: no worker owns a group total; Convex serializes the mutations that add to one row
  checklist: commit-ordered-effects dismissed: counting has no external effect
  checklist: resumption-coverage dismissed: a run that fails adds nothing and leaves no mark, so its retry counts the message once
- a Groups board row never states a drop: Every ranked row of the Groups board carries its places climbed against the same board in the previous period up to the same day, a positive number, and nothing when the group fell or stayed, or the period is all time; a listed group with no kudos attributed then was on that board too.
  over: this week's and all time's Groups board from the pure board function, with groups that rose, fell and stayed, and one that rose from no kudos attributed last week
  via: GB18: places climbed on the Groups board
  refuted: the Groups board's placesClimbed gave every group that had kudos attributed last period its position before minus its position now, a fall or a stay included -> 1 of the 2 tests failed on its assertion, Bees and Cats, which fell, reading negative places (2026-10-14)
  because: the website shows rank-change arrows to encourage (GB18, user story 46); a group row that said how far its group dropped would turn the board into the reproach the groups spec rules out (G18)
  kinds: state
  checklist: revalidated-permission dismissed: the places are computed for the viewer from group totals when they ask; no permission applies
  checklist: separation-of-duties dismissed: no approval policy applies to showing a board
  checklist: legal-state-succession dismissed: the places are derived on every read and hold no state of their own
  checklist: supersession-safety dismissed: the places are derived on every read; nothing is written that a later value could displace
  checklist: worker-fencing dismissed: one read-only query computes the board; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: computing the places issues no external effect
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the board is computed in one query
- the group's line never states a loss: The line under the Groups board for the viewer's group reports its gain per person, rounded once to one decimal, and the places it climbed, never kudos or places lost; without a gain it names the group's best completed period per person, or nothing, and the most improved group is named only for a gain above 0.
  over: the line and the most improved group of groups that gave more, the same, fewer, and a gain that rounds to 0.0, with and without a completed period with kudos
  via: GB14: the group's lines
  refuted: the group's line reported any gain other than 0.0, a loss per person included -> the test of a group that gave fewer kudos than last period failed, its line a gain of -0.4 instead of its best period (2026-10-14)
  because: the group's line is there to encourage (G20, user story 28); a line that told a group it gave less per person would turn a private nudge into a reproach
  kinds: state
  checklist: revalidated-permission dismissed: the line is computed for the viewer from group totals when they ask; no permission applies
  checklist: separation-of-duties dismissed: no approval policy applies to showing a group its progress
  checklist: legal-state-succession dismissed: the line is derived on every read and holds no state of its own
  checklist: supersession-safety dismissed: the line is derived on every read; nothing is written that a later value could displace
  checklist: worker-fencing dismissed: one read-only query computes the line; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: computing the line issues no external effect
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the line is computed in one query
- the Groups board reads within Convex's limits: The Groups board and its comparison read the copy's groups of the workspace and its group mode, each counting group's primary members through one index range, each group's own row of the period and of the previous one, one index range per current primary member for their group totals of both periods, never the totals of members who left the group, and the viewer's group's week or month rows, so a workspace of 1,500 members in 60 groups reads its month board after everyone gave every day for two months, and after each member gave for their group and 10 earlier ones in each of two months, within Convex's transaction limits.
  over: the month board on October 31st of a workspace of 1,500 members in 60 groups who each gave kudos every day of September and October, and of 1,500 members who each gave for their group and 10 earlier ones in each of those months, read through groupBoardsOf with Convex's transaction limits enforced
  via: GB35: the Groups board at scale
  refuted: each group's primary members were read by scanning every member's groups row instead of the group's one index range -> the test failed on Convex's limit, too many documents scanned in a single function execution (2026-10-14)
  refuted: each group's givers were found among all its group totals of both periods, members who left the group included -> the test of members who gave for 10 earlier groups failed on Convex's limit, too many documents scanned in a single function execution (2026-10-14)
  because: a board that throws shows nobody anything (GB35); a read that grows with groups times members, or with every period a group ever had, would fail at a large workspace long before a small one shows it
  kinds: state
  checklist: revalidated-permission dismissed: the board is read for the viewer from group totals when they ask; no permission applies
  checklist: separation-of-duties dismissed: no approval policy applies to reading a board
  checklist: legal-state-succession dismissed: the read writes nothing; a group total only grows by addition
  checklist: supersession-safety dismissed: the read writes nothing; Convex serializes the mutations that add to one group total row
  checklist: worker-fencing dismissed: one read-only query reads the board; no lease or ownership applies
  checklist: commit-ordered-effects dismissed: reading the board issues no external effect
  checklist: resumption-coverage dismissed: no batch resumes from a checkpoint; the board is read in one query
- the Monday post names no member: The groups Monday post names groups only: up to three groups with their kudos per person, the most improved group and how many people gave kudos, and never a member, by mention or by name, whoever gave or received last week's kudos. The top-kudos post that `album-slack` makes of it names only the people in the kudos it quotes and, while `weekly-highlights` applies, up to three new givers with their counts, never a full ranking (LP90).
  over: the post Slack received on Monday after a week of kudos given by members with a group and by an admin without one, every member's mention and name looked for in it, a week with one giver, and a week nobody gave
  via: GB28, GB31: the Monday post names groups, never a person
  refuted: lastWeeksPostOf listed last week's top givers by real name instead of the Groups board's first three groups -> 2 of the 4 tests failed, the post containing Ann Example (2026-10-15)
  because: the Monday post is the only public post about standings (GB31, G45); a post that named the top givers would turn a celebration of groups into a public individual ranking the groups spec rules out
  kinds: output
  checklist: destination-confinement dismissed: the post goes only to the announcement channel an admin picked, read again in the claiming mutation; no destination comes from the post's content
  checklist: redaction dismissed: the post carries group names, kudos per person and a count of givers, and no member's identity to redact
  checklist: commit-ordered-effects declared as the Monday post goes out at most once a week
  checklist: circuit-breaker-policy dismissed: no breaker is declared; one chat.postMessage per claimed week is the whole effect
  checklist: declared-target-coverage dismissed: renderMondayPost in convex/feedback/mondayPost.ts is the one renderer the Slack adapter posts; its lines are built only from the claimed week's groups, most improved group and giver count
- the Monday post goes out at most once a week: Each workspace's Monday post is sent to Slack at most once per week, the Monday in the switching admin's time zone: a second job for a week already claimed, a job from before a switch-off, and the job run again after a post whose answer was lost send nothing more that week, a post Slack never received is sent once Slack allows it, and the next week posts again.
  over: two jobs for one claimed week, a job scheduled before a switch-off, a post whose answer was lost with its job run again that week, and a post rate-limited once, held back by an earlier hold, held back by a hold extended again and again, or rate-limited three times, each read as the chat.postMessage calls Slack received
  via: GB28: the Monday post goes out at most once a week
  refuted: claimWeek no longer looked for the workspace's claim of the week before claiming it again -> 2 of the 3 tests failed, the post sent twice at Monday 9:00 (2026-10-15)
  because: a post sent twice in one week spams the whole company's announcement channel (GB28); a lost answer may have landed, so sending again risks a duplicate the app can't take back
  kinds: message, state
  checklist: revalidated-permission dismissed: the job carries no member's permission; the claiming mutation reads the switch, its generation, `monday-post` in the workspace decision, the channel and groups' availability again before Slack is called
  checklist: destination-confinement dismissed: the channel posted to is the announcement channel stored on the claim, read in the claiming mutation
  checklist: message-authenticity dismissed: the job is scheduled by the backend's own mutations; no outside request starts it
  checklist: input-validation dismissed: the job's workspace and generation are checked by Convex's argument validators and compared against the stored switch
  checklist: separation-of-duties dismissed: no approval policy applies to the weekly post
  checklist: legal-state-succession dismissed: a claim moves once from claimed to posted, couldn't post or failed, and recordOutcome changes only a claim still claimed
  checklist: supersession-safety dismissed: every switch or time zone change bumps the generation, and a job carrying an older one does nothing
  checklist: retry-recognition dismissed: only a post Slack never received is tried again, by a job that must claim the week anew; a job run again after any other answer finds the week's claim
  checklist: duplicate-suppression dismissed: the claim row per workspace and week, written in the mutation that checks for it, lets one job post a week
  checklist: keyed-ordering dismissed: no ordered transport is relied on; jobs for one week are told apart by the claim
  checklist: worker-fencing dismissed: the claim is the fence; Convex serializes the mutations that read and write one workspace's week
  checklist: acknowledgment-barrier dismissed: no request waits on the post; the admin's click is answered once the switch is stored
  checklist: commit-ordered-effects dismissed: the claim commits before the Slack adapter calls chat.postMessage, so a crash after the call leaves the week claimed
  checklist: retry-classification dismissed: a hold or a rate-limit refusal means Slack never received the post, so it is tried again after it, three requests at most, a hold using up none; any other answer but a delivered post is recorded on the claim and never retried
  checklist: resumption-coverage dismissed: a week whose job crashed after claiming stays claimed and posts nothing more; the next week's job was scheduled before the claim
- only an admin or the maintainer switches the Monday post: A workspace admin or owner in App Home, or the maintainer while `workspace-settings` applies to them in the website's Settings, switches the Monday post on or off, both through setMondayPost and its rules, so either one's switch shows in the other's; the website's switch answers set only when the switch is still shown to the maintainer afterwards and reads as asked, so it, and the switch in its Settings read, are refused to a workspace admin who isn't the maintainer, to the maintainer while `workspace-settings` or `monday-post` is off for them, switching off included, and where no announcement channel is set, a post still stored on included, and each refusal writes nothing, because the website switch runs only while the switch is shown.
  over: getSettings and setWeeklyPost for a workspace admin who isn't the maintainer, for the maintainer with `workspace-settings` off and with `monday-post` off (switching on and off), and where no announcement channel is set (an empty row, and switching on and off one still stored on); and an admin's App Home showing the maintainer's switch on, then its `Switch off` showing in the maintainer's Settings
  via: only an admin or the maintainer switches the Monday post
  refuted: setWeeklyPost no longer refused a member to whom workspace-settings isn't shown -> 1 of 5 tests failed: a workspace admin who isn't the maintainer switched it on from the website, answered set (2026-10-19)
  because: the product owner asked to switch the weekly post on himself (2026-10-19), and he is the maintainer but not a Slack admin; a second rule set for his switch could drift from the admins' and book a post the Admin tab would refuse, and a website switch open to any admin would hand the company's announcement channel to a surface only the maintainer was given
  crossing: browser -> domain
  entrances: mutation setWeeklyPost
  kinds: identity, state
  checklist: capability-authorization dismissed: no credential carrying bounded permission is accepted; the acting member is the one the live session names, and the right is read from the deployment's configuration and the flags on every switch
  checklist: revalidated-permission declared as only an admin or the maintainer switches the Monday post
  checklist: canonical-encoding dismissed: the maintainer is matched by the Slack user ID exactly as the directory stores it
  checklist: identity-continuity dismissed: no identity succession is undertaken; a member is one Slack user in one workspace
  checklist: separation-of-duties dismissed: no approval policy applies; one switch is the whole operation
  checklist: legal-state-succession dismissed: the switch moves between on and off, each change bumping the generation that fences older jobs
  checklist: supersession-safety dismissed: each switch bumps the generation, so a job booked before it posts nothing
  checklist: worker-fencing dismissed: the weekly job is fenced by the generation it carries
  checklist: commit-ordered-effects dismissed: the switch only books a job; the post is sent after the claiming mutation commits
  checklist: resumption-coverage dismissed: no batch operation resumes
- the weekly post goes to the channel the maintainer picked: While `weekly-post-channel` applies in the workspace decision, the maintainer's Settings read offers a channel pick beside the post's switch, and a pasted link to a channel (`https://<workspace>.slack.com/archives/<ID>`, `https://app.slack.com/client/<team>/<ID>`) or its bare ID is checked by the Slack adapter joining it: a public channel it joined becomes the post's channel under the name Slack gave, and the check reads picked, which the read shows with the channel's Slack link, and from then on the post, the switch and the Admin tab use it while the announcement channel stays as it was, the Admin tab's `can't post` note sending admins to the maintainer rather than to the announcement channel's picker; a private channel, a channel shared with another organization (Slack Connect), a customer channel (its name starts with `customer-`), the last two refused before any join and again by the join's own answer, a channel Slack can't find, an archived one, and a check Slack gave no answer about are each recorded as why, keeping the channel picked before; each pick is numbered and its check counts only while it is the latest, so of two picks in a row, of the same channel or not, only the later one's check counts; anything else pasted is refused as not a channel link before anything is stored or asked of Slack; and the read's `can't post` follows the post's channel, so picking another channel clears it.
  over: getSettings, pickWeeklyPostChannel and the weekly job for the maintainer with no channel picked, a public channel picked by its archive link, by a client link after another pick whose join answers last and by its bare ID, the same channel picked twice whose first check fails first, a private, an archived, a Slack Connect and a customer channel, a channel Slack can't find and one whose check got HTTP 500, five pastes that aren't channel links, a post Slack refused in the picked channel followed by another pick, and an admin's App Home and the announcement channel after a pick, and an admin's App Home after the post couldn't go to the picked channel; and the exposure of `weekly-post-channel` from the read and the pick
  via: the maintainer picks the weekly post's channel
  refuted: switchableChannelIn in convex/leaderboard/mondayPost.ts no longer returned the picked channel, only the announcement channel -> 7 of 18 tests failed on their assertions: the read kept linking the announcement channel, and the Admin tab and the Monday post stayed there after a public channel was picked (2026-10-20)
  because: the product owner asked for a channel picker (2026-10-20): the announcement channel is the one an admin picked for level-ups, and the post quotes kudos words, so it may only land where the bot is allowed in public, never in a private channel those words were not shown in (AL61, AL63); the join answers both questions with the scopes the app already has, since a channel list would need a new scope and a reinstall; once production's rows hold the pick's `channel` and `channelCheck`, reverting the picker is one-way, because a schema without those fields refuses the rows, so a revert clears the fields or keeps them in the schema first
  crossing: browser -> domain
  entrances: mutation pickWeeklyPostChannel, query getSettings
  kinds: state, message, output
  checklist: destination-confinement declared as the weekly post goes to the channel the maintainer picked
  checklist: input-validation declared as the weekly post goes to the channel the maintainer picked
  checklist: message-authenticity dismissed: the pick comes from the maintainer's live session, and the join's answer is read straight from Slack's API by the backend's own action
  checklist: redaction dismissed: the read carries the picked channel's name and the check's outcome only, both about a public channel or the maintainer's own paste
  checklist: retry-recognition dismissed: a pick only books one join; a pick sent again books another join of the same channel, which Slack answers the same
  checklist: duplicate-suppression dismissed: the stored pick is one value per workspace, so a repeated pick sets the same channel
  checklist: keyed-ordering declared as the weekly post goes to the channel the maintainer picked
  checklist: acknowledgment-barrier dismissed: the website answers checking once the pick is stored; the read shows the check's outcome when it lands
  checklist: commit-ordered-effects dismissed: the pick and its join job commit together, and the outcome is stored by a mutation after Slack answers
  checklist: retry-classification dismissed: a check is never retried; a failed one says so and the maintainer pastes again
  checklist: circuit-breaker-policy dismissed: no breaker is declared for Slack calls
  checklist: declared-target-coverage dismissed: the post has one target, the picked channel or else the announcement channel, read in the claiming mutation
  checklist: revalidated-permission dismissed: the pick's rights are read when it arrives, under only the maintainer picks the weekly post's channel, and the claiming mutation reads `weekly-post-channel` in the workspace decision again when the job runs
  checklist: separation-of-duties dismissed: no approval policy applies; one pick is the whole operation
  checklist: legal-state-succession dismissed: a check moves from checking to one outcome, and only picked, a public channel's outcome, replaces the picked channel
  checklist: supersession-safety declared as the weekly post goes to the channel the maintainer picked
  checklist: worker-fencing dismissed: the join's outcome is stored only while the stored check is still checking the pick number and channel the job carries
  checklist: resumption-coverage dismissed: no batch operation resumes; a join that never answers leaves the check at checking until the maintainer pastes again
- only the maintainer picks the weekly post's channel: The channel pick, pickMondayPostChannel, runs only for the maintainer while `workspace-settings` and `monday-post` apply to them, never for a workspace admin as such, while the Monday post has a channel, and while `weekly-post-channel` applies in the workspace decision, which it decides with exposure; it answers checking only when it booked the join; a workspace admin who isn't the maintainer, the maintainer while `workspace-settings` or `weekly-post-channel` is off, and a workspace without a channel for the post are refused, storing no pick and asking nothing of Slack; a Slack click naming the pick is no command at all, even from a maintainer who is a workspace admin; and while `weekly-post-channel` is off the read is as before, and a channel picked while it was on gets no post, the announcement channel does.
  over: pickWeeklyPostChannel for a workspace admin who isn't the maintainer, for the maintainer with `workspace-settings` off, with `weekly-post-channel` turned off after a pick (the read, a second pick read through every table, and the next Monday's post), and without an announcement channel; and a forged Slack click naming pickMondayPostChannel from a maintainer who is a workspace admin
  via: only the maintainer picks the weekly post's channel, and only while weekly-post-channel is on
  refuted: pickMondayPostChannel in convex/leaderboard/mondayPost.ts passed the clicking member's admin role to setsMondayPost instead of admitting the maintainer only -> 1 of 5 tests failed on its assertion: a workspace admin who isn't the maintainer picked a channel and the join was asked of Slack (2026-10-20)
  because: the product owner asked to pick it himself, as the maintainer (2026-10-20); a pick open to any admin, or reachable from a Slack click the website's rules never saw, would move a post that quotes kudos words to a channel nobody chose, and a flag only the workspace decides keeps what Settings shows and where the job posts the same
  crossing: browser -> domain
  entrances: mutation pickWeeklyPostChannel
  kinds: identity, state
  checklist: capability-authorization dismissed: no credential carrying bounded permission is accepted; the acting member is the one the live session names, and the right is read from the deployment's configuration and the flags on every pick
  checklist: revalidated-permission declared as only the maintainer picks the weekly post's channel
  checklist: canonical-encoding dismissed: the maintainer is matched by the Slack user ID exactly as the directory stores it
  checklist: identity-continuity dismissed: no identity succession is undertaken; a member is one Slack user in one workspace
  checklist: separation-of-duties dismissed: no approval policy applies; one pick is the whole operation
  checklist: legal-state-succession dismissed: a pick moves the check to checking and then to its outcome; only a check still checking that same channel takes an outcome
  checklist: supersession-safety dismissed: a later pick replaces the check with the next pick number, so an earlier join's answer is ignored, for the same channel too
  checklist: worker-fencing dismissed: the join's outcome is fenced by the channel the stored check names
  checklist: commit-ordered-effects dismissed: the join is booked by the mutation that stores the pick
  checklist: resumption-coverage dismissed: no batch operation resumes
- the Monday post is dark wherever monday-post is off: An admin for whom `monday-post` is off in the member decision, not created, or undecided because the flags key is missing sees no Monday post in the Admin tab, and a forged command switches nothing on, so every Slack call equals those with the flag off; no Monday post goes out in a workspace where `monday-post` doesn't apply in the workspace decision. With the flag on for one admin's email only, every other admin's App Home shows the same views as with it off.
  over: every Slack call of one walk by two admins (the Admin tab asked for, a forged Switch on and time zone, a week of kudos and two weeks of jobs) with `monday-post` off, not created, and on while the flags key is missing, and the same walk with it on for one admin's email only, the other admin's App Home views compared
  via: GB28: the Monday post is dark wherever monday-post is off
  refuted: setsMondayPost in convex/leaderboard/mondayPost.ts answered true for every admin, whatever their monday-post member decision -> 2 of the 3 tests failed: with the flag off the Admin tab showed the Monday post, and with it on for Alice's email only Sam saw the switch (2026-10-15)
  because: decision 18 ships unfinished work to the product owner first, and `monday-post` starts in the sandbox and for the product owner only (#333); a switch shown, or a post sent to the company's announcement channel, where the flag is off would publish a feature nobody chose to show, in the one public channel a post can't be taken back from
  crossing: slack-request -> domain
  entrances: route POST /slack/events, route POST /slack/interactivity
  kinds: output, message
  checklist: destination-confinement dismissed: the Admin tab goes to the admin who asked for it and the post to the announcement channel read in the claiming mutation; no destination comes from input
  checklist: message-authenticity dismissed: the Slack adapter verifies every event and click's signature before the domain sees it, and the job is scheduled only by the backend's own mutations
  checklist: redaction dismissed: the switch and the post are left out by the flag decision, and nothing designated sensitive is scrubbed from what remains
  checklist: input-validation dismissed: setMondayPost's arguments are checked by the command validator, and the flag is read again in the mutation that would store the switch
  checklist: retry-recognition dismissed: nothing is sent where the flag is off, so there is no landed effect to recognize
  checklist: duplicate-suppression declared as the Monday post goes out at most once a week
  checklist: keyed-ordering dismissed: no ordered transport is relied on; each Admin tab render and each job reads the flag itself
  checklist: acknowledgment-barrier dismissed: no request waits on the post; a refused command is answered like any click
  checklist: commit-ordered-effects dismissed: the claiming mutation reads `monday-post` in the workspace decision before it claims the week, and the Slack adapter posts only a claimed week
  checklist: retry-classification dismissed: nothing is retried where the flag is off
  checklist: circuit-breaker-policy dismissed: no breaker is declared for Slack delivery
  checklist: declared-target-coverage dismissed: the Admin tab has one target, the admin it is rendered for, and the post one, the workspace's announcement channel
- turning monday-post off pauses the Monday post: A job scheduled while `monday-post` was on and run after it was turned off, deleted, or left undecided without the flags key posts nothing and claims no week, and a Switch on, Switch off or time zone from an Admin tab published while it was on, clicked after it turned off, changes nothing stored and schedules no post. Turned on again, the Admin tab shows the switch as it was and the next Monday's post goes out. The exposure goes once per admin and value, and never to a member who isn't an admin, even one who forges the switch.
  over: a job scheduled while the flag was on and run after each of the three ways it turns off, read as the chat.postMessage calls Slack received, the claims and the next job; every stored row before and after three stale clicks; and the exposures of two admins and a member who forges the switch, through the flag turned off and on again
  via: GB28: the monday-post flag turned off and on, its stale clicks and its exposure
  refuted: postableChannelIn in convex/leaderboard/mondayPost.ts no longer read monday-post in the workspace decision before the week is claimed -> 3 of the 6 tests failed: the job scheduled while the flag was on posted at Monday 9:00 after it was turned off or deleted (2026-10-15)
  because: a job outlives the flag decision that scheduled it, so a post scheduled during a preview would go out after the flag turned off unless the claiming mutation reads it again (decision 18); a stale click that still stored a switch would leave the post running where nobody can see its controls
  crossing: slack-request -> domain
  entrances: route POST /slack/interactivity
  kinds: state, message
  checklist: revalidated-permission dismissed: setMondayPost reads `monday-post` in the clicking admin's member decision and their admin role again when the click arrives, and the claiming mutation reads the workspace decision again when the job runs
  checklist: destination-confinement dismissed: the post goes only to the announcement channel read in the claiming mutation; no destination comes from the click or the job
  checklist: message-authenticity dismissed: the Slack adapter verifies every click's signature before the domain sees it, and the job is scheduled only by the backend's own mutations
  checklist: input-validation dismissed: the click's command is checked by the command validator and its time zone by isTimeZone before anything is stored
  checklist: separation-of-duties dismissed: no approval policy applies to the weekly post
  checklist: legal-state-succession dismissed: while the flag is off nothing moves the switch or a claim; turned on again they go on from where they were
  checklist: supersession-safety dismissed: the generation still fences the jobs; a refused stale click bumps nothing
  checklist: retry-recognition dismissed: no week is claimed while the flag is off, so the job run again on the flag turned on finds an unclaimed week to post
  checklist: duplicate-suppression declared as the Monday post goes out at most once a week
  checklist: keyed-ordering dismissed: no ordered transport is relied on; each job and each click reads the flag itself
  checklist: worker-fencing dismissed: the week's claim is the fence, and none is written while the flag is off
  checklist: acknowledgment-barrier dismissed: a refused stale click is answered like any click, and no request waits on the post
  checklist: commit-ordered-effects dismissed: the claiming mutation reads `monday-post` before it claims the week, and the Slack adapter posts only a claimed week
  checklist: retry-classification dismissed: nothing is retried while the flag is off; the weekly job reschedules itself whatever the flag says
  checklist: resumption-coverage dismissed: the job schedules next Monday's in a mutation of its own before it claims the week or reads the flag, so the chain goes on through the flag being off or a claim that fails, and posts again once it can
  checklist: retry-classification dismissed: every answer but a delivered post, a hold or a rate-limit refusal is recorded and never sent again that week, a lost one included
