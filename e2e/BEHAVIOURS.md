# Behaviours and their journeys

Every user-facing behaviour of HedgeHug, inventoried from the code and the specs, with the journey that proves it. Journeys run with the flags production had when it was paused (`fakes/productionFlags.ts`), so they prove what its members saw. A ticked line has its journey in `journeys/`; an unticked one is still owed. The stage says what a journey needs beyond signed Slack requests and the Slack fake: **flags** means the fake serves PostHog flag definitions, **clock** means the test-only trigger that runs a scheduled job on demand, **browser** means the website.

## Giving and the daily allowance

- [x] A thank-you with the kudos emoji marks the message and tells the giver privately what's left today (`giving.e2e.ts`)
- [x] The last kudos of the day says so, and a thank-you beyond the allowance waits under an hourglass (`giving.e2e.ts`)
- [x] Several people in one message, and a repeated emoji, each get their share (`giving.e2e.ts`)
- [x] A thank-you in a thread answers in the thread (`giving.e2e.ts`)
- [x] A private channel counts like a public one; direct messages, group DMs and bots' messages don't count (`where.e2e.ts`)
- [x] Mentions that can't receive kudos are skipped with a reason: yourself, a bot, someone who left, `@here`, `@channel` and user groups (`mentions.e2e.ts`)
- [x] Editing a message that gave nothing gives kudos; editing one that gave kudos changes nothing and says so (`edits.e2e.ts`)
- [x] Editing a message over the allowance down to what's left swaps the hourglass for the kudos emoji (`edits.e2e.ts`)
- [x] A redelivered event gives nothing twice (`giving.e2e.ts`)
- [x] A giver or recipient the app doesn't know yet is looked up, and the kudos lands when Slack answers (every journey: its members are new to the app)
- [ ] A member Slack doesn't know yet at first lands at a later lookup (clock: the next lookup is a minute on)
- [x] Slack's rate limit delays the mark, never loses it (`giving.e2e.ts`)
- [x] The allowance refills at the giver's midnight (`allowance.e2e.ts`)

## Slash commands

- [x] `/hedgehug` in a channel joins it, and says so when it is already in, can't join a private channel, stays out of shared and customer channels, or is run in a direct message (`join.e2e.ts`)
- [x] `/hedgehug @someone` shows their profile card, looking them up first when the app hasn't met them, or says why it can't (`commands.e2e.ts`)
- [x] `/hedgehug leaderboard`, `month` and `all` show the boards, and a wrong period shows how to ask (`hugs.e2e.ts`, `commands.e2e.ts`)

## Replies, direct messages and nudges

- [x] A member's first kudos, given or received, brings their welcome, once (`welcome.e2e.ts`)
- [x] The private reply goes where the member's message settings put it: the channel, a DM or nowhere (`home.e2e.ts`)
- [x] XP gains join the reply, and crossing a level brings the level-up message (`levels.e2e.ts`, and every giving journey reads the XP)
- [x] A hug reaction counts once, never on your own message, and a member's first hug is explained, to them and to the author (`hugs.e2e.ts`)
- [ ] Public celebrations go to the announcement channel when it is switched on (flags)

## App Home

- [x] Opening App Home publishes it with the member's tabs, and an admin's with the Admin tab (`home.e2e.ts`)
- [x] Switching tabs, leaderboard visibility and message settings publish App Home again, and the boards and replies follow them (`home.e2e.ts`)
- [ ] Admins switch the Monday post, the welcome nudge and public celebrations, and pick the announcement channel (flags)
- [ ] The avatar and the custom kudos emoji answer their buttons (flags)

## Progression, achievements, quests and the album

- [ ] Quests are drawn each week and their progress joins the reply (flags, clock)
- [ ] Thoughtful kudos bring packs, stickers and hoggies into the album (flags)
- [ ] Newly shipped features are announced to members who reached them (flags, clock)

## Groups, teams and boards

- [ ] User groups sync from Slack, and a member's group pick on App Home puts them on the groups board (flags, clock)
- [ ] The leaderboards rank givers and receivers by week, month and all time (flags)

## Scheduled posts

- [ ] The Monday direct message recaps hugs and quests, and its buttons stop and resume it (flags, clock)
- [ ] The Monday post names the week's top kudos in the announcement channel (flags, clock)

## Channels, links and emoji

- [ ] A new public channel is joined, and a channel that becomes shared or a customer channel is left
- [ ] Links to the website unfurl into previews (flags)
- [ ] Custom emoji sync from Slack and can be picked as the kudos emoji (flags, clock)

## Website

- [ ] A deleted message leaves the activity and the spotlight; Slack takes its reactions away itself, and HedgeHug calls Slack for nothing (browser)
- [ ] A member signs in with Slack and lands where they started, and the refusals the handshake suite proves create no session (browser)
- [ ] While the website is closed nobody signs in, and an unverified person never reads as a member (browser, flags)
- [ ] Activity, leaderboard, quests, skills, the book and settings show the member's own data (browser, flags)
- [ ] A setting changed on the website changes it in Slack too (browser, flags)

## Off in production

Their flags were off for production's members at the pause, or on only for the app's owner, so members never saw them and no journey is owed until a flag turns them on: unlocks and their perks, the store, coins and crates, achievements' tiers, the skill tree, team spirit, the hoggie forge, the level-up reveal, random emojis, workspace settings, and the nudge to add the kudos emoji to a thank-you.
