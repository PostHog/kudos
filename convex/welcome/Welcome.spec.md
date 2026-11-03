# Welcome

Welcome: the first kudosGiven subscriber, the first hugGiven subscriber, and questFinished's subscriber for the Journey's `first-thanks`. Off the Monday path it records each member it welcomes with that counterpart and asks feedback for the welcome message the first time a Given award names them, as giver or recipient, with the counterpart by Slack user (the giver for a recipient, the recipients for a giver), and publishes memberWelcomed for each member it welcomes; and, while `onboarding` and `hidden-items` are on for the giver, read without an exposure, it answers the hug hugGiven marks as the giver's first with the first-hug reply the Slack adapter posts (core-loop LP73). It welcomes at most 100 members per mutation, each with its welcome row, its delivery and its memberWelcomed, and schedules itself with the event and a cursor over the event's members for the rest (QM10). On the Monday path (`monday-quest` on for the member, read without an exposure) a member is welcomed by their first act and by nothing else: their first hug, the kudos that finishes their `first-thanks` and is paid on the Monday path, or any kudos they receive (MQ14, HH12). In that act's subscriber, one mutation writes the member's one welcomes row with its path, publishes memberGreeted for the welcome item, starts their quests where the Monday path is shown to them (read with exposure), and schedules the welcome DM with their onboarding journey at that moment (MQ13, MQ17); it sends no first-hug reply, asks for no welcome message and publishes no memberWelcomed (MQ15), and feedback's welcome nudge stands down for a member it welcomed or that the same kudos welcomes (MQ16). While `two-quests` is on for the member, read without an exposure when the DM is built, the welcome's card keeps its heading, its onboarding checklist, its Up next and its reward line, and adds the hug ladder's next step as the checklist's first row, with its hugs on the ladder, how to hug and its 20 XP reward, while the ladder is unfinished; the row Quests answers as the member's next quest (HH55) is the one marked next, so the onboarding quests carry no mark while the ladder's step is next; the scheduled delivery's arguments stay as they were, and the card reads these rows when it is built (HH54). The Slack adapter posts the DM, tried at most 3 times, a rate-limit hold or refusal sent again and an unknown answer never; the module reports dm sent with the welcome's path only for a delivered DM, never for one gone or failed (MQ18). Nothing welcomes with path `catch-up` any more: the catch-up went out once and is retired, and its stored rows stay readable (MQ31–MQ33).

## invariants
- welcomed at most once: A member gets the welcome message at most once, ever, whatever Slack redelivers and whichever Given awards name them later.
  over: the welcome messages sent for a first Given award, a redelivery of the Slack event that gave it, later awards that name the same members as giver or recipient, and one Given award naming more members than one page welcomes (QM10)
  via: a member is welcomed at most once, whatever Slack redelivers and whichever awards follow
  because: the welcome is a one-time introduction (R42, R44); without the record of who was welcomed, every Given award naming a member would DM them again and turn the welcome into noise
  refuted: removed the isWelcomed check in welcomeNewMembers -> the test failed on its one-welcome-per-member assertion with 3, 3 and 2 welcomes (2026-10-13)
  kinds: message, state
  checklist: revalidated-permission dismissed: the welcome needs no permission beyond the bot's chat:write scope, which Slack checks when the DM is sent
  checklist: destination-confinement dismissed: the DM goes only to the welcomed member's own Slack user id through Slack's API at one configured base URL, and no response can redirect it
  checklist: message-authenticity dismissed: the kudosGiven event comes from the engine's own transaction, never from outside; the Slack event behind it is covered by signed Slack requests only
  checklist: input-validation dismissed: the subscriber's argument is checked by the kudosGiven event validator, and only the engine publishes the event
  checklist: separation-of-duties dismissed: no approval policy applies to welcoming a member
  checklist: legal-state-succession declared as welcomed at most once
  checklist: supersession-safety dismissed: a welcome is never replaced; the first record stands and every later decision only skips the member
  checklist: retry-recognition dismissed: the subscriber is a mutation Convex runs exactly once; a retried delivery repeats only the DM, which R44 bounds at 3 tries
  checklist: duplicate-suppression declared as welcomed at most once
  checklist: keyed-ordering dismissed: no ordered transport carries the welcome
  checklist: worker-fencing dismissed: no lease or ownership change applies; each subscriber run is one serialized mutation
  checklist: acknowledgment-barrier dismissed: nothing acknowledges the welcome; the Slack event is acknowledged after the mutation that records its award commits
  checklist: commit-ordered-effects dismissed: the DM is scheduled from the subscriber's mutation, and Convex runs a scheduled action only after that mutation commits
  checklist: resumption-coverage dismissed: a page schedules the next one with the same event and the next cursor in the mutation that welcomes its own members, so the pages walk the event's fixed list of members in order and none is left out; a page run again only skips members already welcomed
  checklist: retry-classification dismissed: the Slack adapter's delivery path classifies the DM's failures, retrying every failure, an unknown result included, until 3 tries (R44) and stopping on a gone answer, by its invariant a gone delivery stops for good
- a welcome never schedules past Convex's limit: No mutation of the welcome subscriber schedules 1,000 functions or more, however many new members one Given award names, since each page welcomes at most 100 members (QM10).
  over: one Given award naming 700 new members besides its giver, under a base allowance a maintainer raised, run with Convex's transaction limits on and each welcome page's scheduled functions counted
  via: a welcome never schedules past Convex's limit: one kudos naming 700 new members welcomes each of them once, and no welcome mutation schedules 1,000 functions or more
  because: Convex refuses a mutation that schedules more than 1,000 functions, so one unpaged loop over hundreds of new members, scheduling a delivery and a memberWelcomed subscriber for each, would roll the welcome back and welcome nobody
  refuted: raised membersPerPage in welcomeNewMembers to 100,000 -> the test failed with Convex's "Scheduled too many functions in a single function execution (limit: 1000)" from the first page's requestWelcome (2026-10-14)
  kinds: budget
  checklist: bounded-admission dismissed: nothing admits concurrent work; each page is one serialized mutation
  checklist: fair-admission dismissed: no contenders wait for capacity; the pages run in the order they are scheduled
  checklist: rate-budget dismissed: no time-window budget applies; Slack's rate limits are the delivery path's
  checklist: memory-budget dismissed: no evaluator allocates against a memory budget
  checklist: execution-budget declared as a welcome never schedules past Convex's limit
  checklist: circuit-breaker-policy dismissed: no dependency failures open or close anything here
- a giver's first hug ever gets one first-hug reply at most: While `onboarding` and `hidden-items` are on for a giver, the first hug they ever give sends them one ephemeral first-hug reply in the hugged message's conversation, and no later hug, redelivered reaction or re-added reaction sends another; Slack refusing it or answering unknown ends it with no retry and no DM, and a giver who hugged before `onboarding` was on for them gets none.
  over: a first hug on an ordinary message and on a Given kudos message, a second hug, a redelivered reaction, a removed and re-added reaction, Slack refusing it, the channel gone, an unknown answer, a rate-limit hold, a giver who hugged while `onboarding` was off, each of the two flags off, and a giver on the Monday path, who gets the welcome DM instead
  via: LP73: a member's first hug ever gets one first-hug reply
  refuted: giveHug marked every hug as the giver's first instead of reading the hugs' giver index -> 5 of 16 tests failed: a second hug, a hug after a refused first reply and a giver who hugged while onboarding was off each got another ephemeral (2026-10-25)
  because: the reply teaches the next step once, from the member's own action (LP73); a second one would repeat a lesson already learned on every hug, and a DM would reach the member away from the message they hugged
  kinds: message
  checklist: destination-confinement dismissed: the reply goes only to the giver as an ephemeral in the hugged message's conversation, both taken from the signed reaction
  checklist: message-authenticity dismissed: the reaction reaches giveHug only through the Slack adapter's signature check, and the reply answers that reaction
  checklist: input-validation dismissed: the scheduled action's arguments are checked by its validator, the workspace, the giver, the conversation and who was hugged
  checklist: retry-recognition dismissed: a redelivered or re-added reaction finds the giver's hug on the message and records nothing, so it publishes no hugGiven, and a later hug's hugGiven is not marked first
  checklist: duplicate-suppression declared as a giver's first hug ever gets one first-hug reply at most
  checklist: keyed-ordering dismissed: one reply is sent per giver, so no two replies need an order
  checklist: acknowledgment-barrier dismissed: the reply is scheduled from welcomeOnHug, which hugGiven schedules from the hug's mutation, so it runs only after the hug's record commits
  checklist: retry-classification dismissed: only a rate-limit hold sends it again; sendAtMostOnce ends it on any refusal or unknown answer
- a member on the Monday path is welcomed once: On the Monday path a member gets one welcomes row and one welcome DM, ever, whichever of their first hug, their first kudos given and a kudos received comes first, whether two of them arrive at once, a later act follows, any of the three subscribers runs again, or the member was welcomed before the Monday path applied to them.
  over: a hug and a thoughtful kudos in the same moment, a hug welcome followed by a first thoughtful kudos, a replay of welcomeOnHug, welcomeNewMembers and welcomeOnFirstThanks, and a member welcomed off the Monday path before `monday-quest` turned on
  via: MQ13: one welcome per member, ever
  refuted: removed the isWelcomed check in welcomeOnTheMondayPath -> 5 of 6 tests failed: the hug and kudos race, a later first thoughtful kudos and each replayed subscriber welcomed the member again (2026-10-25)
  because: the welcome is the one introduction to the Monday path (MQ13); a second one would start the journey again in the member's DMs and pay the welcome item twice
  kinds: message, state
  checklist: revalidated-permission dismissed: the welcome needs no permission beyond the bot's chat:write scope, which Slack checks when the DM is sent
  checklist: destination-confinement dismissed: the DM goes only to the welcomed member's own Slack user id
  checklist: message-authenticity dismissed: hugGiven, kudosGiven and questFinished come from the hugs, engine and quests transactions, never from outside
  checklist: input-validation dismissed: each subscriber's argument is checked by its event's validator
  checklist: separation-of-duties dismissed: no approval policy applies to welcoming a member
  checklist: legal-state-succession declared as a member on the Monday path is welcomed once
  checklist: supersession-safety dismissed: a welcome is never replaced; the first row stands and every later act only reads it
  checklist: retry-recognition dismissed: each subscriber reads the member's welcomes row before writing it, in the same mutation, so a rerun finds it and returns
  checklist: duplicate-suppression declared as a member on the Monday path is welcomed once
  checklist: keyed-ordering dismissed: whichever act's mutation commits first welcomes; the others read its row
  checklist: worker-fencing dismissed: no lease or ownership change applies; each subscriber run is one serialized mutation
  checklist: acknowledgment-barrier dismissed: nothing acknowledges the welcome; the Slack event is acknowledged after the mutation that records the act commits
  checklist: commit-ordered-effects dismissed: the DM is scheduled from the mutation that writes the welcomes row, and runs only after it commits
  checklist: resumption-coverage dismissed: welcomeNewMembers' pages walk the event's fixed list of members, and a page run again finds each member's welcomes row and skips them
  checklist: retry-classification dismissed: the Slack adapter's delivery classifies the DM's answers, sending a rate-limit hold or refusal again and never an unknown answer
