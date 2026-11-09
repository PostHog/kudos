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
- [x] A member Slack doesn't know yet at first lands at the lookup a minute on (`lateLookup.e2e.ts`)
- [x] Slack's rate limit delays the mark, never loses it (`giving.e2e.ts`)
- [x] The allowance refills at the giver's midnight, not UTC's (`allowance.e2e.ts`)

## Slash commands

- [x] `/hedgehug` in a channel joins it, and says so when it is already in, can't join a private channel, stays out of shared and customer channels, or is run in a direct message (`join.e2e.ts`)
- [x] `/hedgehug @someone` shows their profile card, looking them up first when the app hasn't met them, or says why it can't (`commands.e2e.ts`)
- [x] `/hedgehug leaderboard`, `month` and `all` show the boards, and a wrong period shows how to ask (`hugs.e2e.ts`, `commands.e2e.ts`)

## Replies, direct messages and nudges

- [x] A member's first kudos, given or received, brings their welcome, once (`welcome.e2e.ts`)
- [x] The private reply goes where the member's message settings put it: the channel, a DM or nowhere (`home.e2e.ts`)
- [x] XP gains join the reply, and crossing a level brings the level-up message (`levels.e2e.ts`, and every giving journey reads the XP)
- [x] A hug reaction counts once, never on your own message, and a member's first hug is explained, to them and to the author (`hugs.e2e.ts`)
- [x] A level up a message earns is celebrated in the announcement channel while public celebrations are on, and not while they are off (`celebrations.e2e.ts`)

## App Home

- [x] Opening App Home publishes it with the member's tabs, and an admin's with the Admin tab (`home.e2e.ts`)
- [x] Switching tabs, leaderboard visibility and message settings publish App Home again, and the boards and replies follow them (`home.e2e.ts`)
- [x] Admins pick the announcement channel or stop posting there, and switch public celebrations and the Monday post (`admin.e2e.ts`)
- [ ] The avatar picker sets the hoggie a member holds as their avatar (flags, browser: a member holds a hoggie only once they turn an item on the website)

## Progression, achievements, quests and the album

- [x] The onboarding quests, and then a quest drawn each week, show their progress in the giver's reply (`quests.e2e.ts`)
- [x] Each kudos brings the giver an item for their album, one per teammate a week, and the reply's button opens their book on the website to identify it (`album.e2e.ts`)
- [ ] The book on the website shows the items a member's kudos brought them, waiting to be identified (browser)

## Groups, teams and boards

- [x] User groups sync from Slack, and a member's group pick on App Home puts them on their group's board (`groups.e2e.ts`)
- [x] The leaderboards rank members by the hugs they gave, on the week, month and all-time boards alike, never by what they received (`boards.e2e.ts`, `hugs.e2e.ts`)
- [x] The week and month boards stop counting hugs once their period ends, and the all-time board keeps them (`boardPeriods.e2e.ts`)

## Scheduled posts

- [x] The Monday direct message recaps hugs and quests at 9:00 on the member's Monday, and its button stops and resumes the quests (`mondayDm.e2e.ts`)
- [x] The Monday post names last week's most-hugged kudos in the announcement channel at 9:00 (`mondayPost.e2e.ts`)

## Channels, links and emoji

- [x] A new public channel is joined unless it is named for a customer or for sharing, and a channel that becomes shared or is renamed a customer channel is left (`channels.e2e.ts`)
- [ ] Links to a member's or a team's page on the website unfurl into previews (flags, browser or clock: production's flags put a page's address in Slack only in the Monday post, and members copy it from the website)

## Website

- [x] A deleted message leaves the activity and the kudos of the week; Slack takes its reactions away itself, and HedgeHug calls Slack for nothing about it (`deleted.e2e.ts`)
- [x] A member signs in and lands where they started, a deep link included (`signIn.e2e.ts`)
- [x] Someone from another workspace is refused and left signed out, and someone Slack's directory can't verify ends on "Membership not checked", never a member's page (`signIn.e2e.ts`). The sign-in protocol's own refusals (a wrong nonce or audience, a tampered or missing state, a code redeemed twice or without its PKCE verifier) stay in `pnpm test:handshake`: they test today's Slack sign-in, which a rewrite replaces, so they are no journey's
- [x] While the website is closed nobody signs in and a member already signed in reads it closed (`closed.e2e.ts`; the journey switches the `website` flag through the fakes, which answer once the app has reloaded its flags)
- [x] Activity, leaderboard and profile show the member's own kudos from Slack, and settings show their own choices (`pages.e2e.ts`, `settings.e2e.ts`)
- [ ] Quests, skills and the book show the member's own progress (flags: the quests show on the leaderboard and activity, the skill tree is off in production's flags, and no journey reads a quest's or the book's progress yet)
- [x] A leaderboard or reply setting changed on the website changes it in Slack too (`settings.e2e.ts`)

## Off in production

Their flags were off for production's members at the pause, or on only for the app's owner, so members never saw them and no journey is owed until a flag turns them on: unlocks, their perks and the announcement of newly shipped features, the store, coins and crates (and with them picking a custom emoji synced from Slack as the kudos emoji), achievements' tiers, the skill tree, team spirit, the hoggie forge, the level-up reveal, random emojis, workspace settings, and the nudge to add the kudos emoji to a thank-you. The welcome nudge's switch shows only to the app's maintainer, the one member `KUDOS_MAINTAINER` names.
