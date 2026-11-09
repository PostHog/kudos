# Behaviours and their journeys

Every user-facing behaviour of HedgeHug, inventoried from the code and the specs, with the journey that proves it. A ticked line has its journey in `journeys/`; an unticked one is still owed. The stage says what a journey needs beyond signed Slack requests and the Slack fake: **flags** means the fake serves PostHog flag definitions, **clock** means the test-only trigger that runs a scheduled job on demand, **browser** means the website.

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
- [ ] The allowance refills at the giver's midnight (clock)

## Slash commands

- [x] `/hedgehug` in a channel joins it, and says so when it is already in, can't join a private channel, stays out of shared and customer channels, or is run in a direct message (`join.e2e.ts`)
- [ ] `/hedgehug @someone` shows their profile card, or says why it can't (flags)
- [ ] `/hedgehug leaderboard`, `month` and `all` show the boards, and a wrong period shows how to ask (flags)

## Replies, direct messages and nudges

- [ ] A member's first kudos, given or received, brings the welcome message (flags)
- [ ] The private reply goes where the member's message settings put it (flags)
- [ ] XP gains join the reply, and crossing a level brings the level-up message (flags)
- [ ] A hug reaction counts, and a member's first hug is explained (flags)
- [ ] A thank-you without the kudos emoji gets a nudge to add it (flags, a fake model gateway)
- [ ] Public celebrations go to the announcement channel when it is switched on (flags)

## App Home

- [ ] Opening App Home publishes it, with the tabs the member has unlocked (flags)
- [ ] Switching tabs, leaderboard visibility, message settings and the group pick publish App Home again (flags)
- [ ] Admins switch the Monday post, the welcome nudge and public celebrations, and pick the announcement channel (flags)
- [ ] Unlocks, perks, the store, crates, the avatar and the custom kudos emoji answer their buttons (flags)

## Progression, achievements, quests and the album

- [ ] Achievements' tiers bring their message and their place in the book (flags)
- [ ] Quests are drawn each week and their progress joins the reply (flags, clock)
- [ ] Thoughtful kudos bring packs, stickers and hoggies into the album (flags)
- [ ] Newly shipped features are announced to members who reached them (flags, clock)

## Groups, teams and boards

- [ ] User groups sync from Slack, and a member's group pick puts them on the groups board (flags, clock)
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
