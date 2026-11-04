# Parser

Kudos parser: turns a chat message's countable content into a kudos message, with parse hooks deciding a giver's kudos emoji and adding annotations.

## invariants
- a kudos message gives as many kudos as its most repeated kudos emoji: A kudos message gives each recipient as many kudos as the kudos emoji that counts for them it holds most often, whichever hook claims it, the workspace's kudos emoji, a store emoji the giver owns or an emoji they earned in the album, a hook claiming an emoji for one person only, such as a hype emoji: different kudos emojis in one message add nothing to each other, while each repeat of one emoji gives one more (R4 as amended).
  over: a kudos message holding the workspace's kudos emoji beside the giver's team emoji, the workspace's kudos emoji twice beside it, the team emoji three times beside the workspace's kudos emoji, and two mentions beside the workspace's kudos emoji and one teammate's hype emoji twice, read through the recipients' kudos, the giver's allowance spent and private reply
  via: a message gives each recipient as many kudos as its most repeated kudos emoji
  because: one message is one thank-you, and since every earned album emoji counts as a kudos emoji (AL34 as amended by #746) a giver who adds their team emoji beside the workspace's would pay a teammate twice and spend twice the allowance for the same thanks; a repeat of one emoji is how a giver says more
  refuted: mostRepeatsIn counted the distinct kudos emoji names instead of the most repeats of one name -> 2 of 3 tests failed on their assertions: the workspace's kudos emoji beside the team emoji gave 2 kudos, and the team emoji three times beside it gave 2 (2026-10-21)
  refuted: kudosFor counted every kudos emoji in the message for each recipient, ignoring whom a claim counts for -> 1 of 4 tests failed on its assertion: two mentions beside the workspace's kudos emoji and one teammate's hype emoji twice asked for 4 kudos and gave nothing where 2 and 1 belong (2026-11-04)
  kinds: state
  checklist: revalidated-permission dismissed: no permission is involved; the count is read in the mutation that decides the kudos
  checklist: separation-of-duties dismissed: no approval policy; a giver's own message decides what it gives
  checklist: legal-state-succession dismissed: the count writes nothing; the message's once-check decides whether it gives (a message gives kudos at most once)
  checklist: supersession-safety dismissed: the count writes nothing that a later write could displace
  checklist: worker-fencing dismissed: no worker owns the count; it runs inside the giving mutation
  checklist: commit-ordered-effects dismissed: the count issues no external effect
  checklist: resumption-coverage dismissed: no batch counts kudos emoji; a message waiting on the directory is counted again by the same parse when rechecked
- a given kudos message shows the kudos emoji closest after its recipient's mention: The kudos emoji a given kudos message shows as the app's reaction, and names in its kudosGiven, is the first kudos emoji that counts for its first recipient after the mention of that recipient, or, with none after it, the closest such kudos emoji before it, whatever comes before that mention, such as a kudos emoji after the giver's own mention or another person's hype emoji.
  over: a kudos message with one kudos emoji before the recipient's mention and one after it, two after it, one after the giver's own mention and one after the recipient's, none after it with two before it, and another teammate's hype emoji right after the first recipient's mention, read through the app's reactions on the message
  via: the app reacts with the kudos emoji closest after the recipient's mention
  because: a giver writes the emoji they mean for a teammate beside that teammate's name, and since every earned album emoji counts as a kudos emoji (#746) the one they put after the mention is the one they chose to thank with; reacting with an emoji written before the mention, or one meant for nobody, shows a different thanks than the one they gave
  refuted: kudosEmojiClosestAfter counted a kudos emoji just before the recipient's mention as after it -> 3 of 4 tests failed on their assertions: the app reacted with the emoji before the mention, or the one before the closest, instead of the one after it (2026-10-21)
  refuted: kudosEmojiClosestAfter chose among every kudos emoji in the message, not only those that count for the first recipient -> 1 of 5 tests failed on its assertion: the app reacted with another teammate's hype emoji after the first recipient's mention instead of the workspace's kudos emoji (2026-11-04)
  kinds: output
  checklist: destination-confinement dismissed: the reaction goes to the message itself through the Slack adapter's one configured base URL; the choice of emoji changes no destination
  checklist: redaction dismissed: the reaction names an emoji the giver wrote in the message, never its words
  checklist: commit-ordered-effects dismissed: the reaction is still set through the indicator delivery scheduled by the evaluating mutation, as before
  checklist: circuit-breaker-policy dismissed: no failure history is involved; the delivery keeps its own retries (the indicator converges)
  checklist: declared-target-coverage dismissed: one message gets one reaction; there is no fan-out
