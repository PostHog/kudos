# Workspace

Workspace: the settings with their defaults and the directory of the workspace's people, with the name each one goes by, whether each member is a workspace admin or owner and the email, real name, display name, title and picture Slack gives for a member, none of which a member who leaves keeps, and Slack's daily list of the workspace's members, kept apart from the directory and read only by the maintainer's hype picker, a person it lists as a bot, as deleted or in another workspace leaving it while the listing that says so is kept, so a page of the list older than it changes nothing, and recording a person it lists in the directory, as a first lookup does, only when the maintainer maps a hype emoji to them (#128), and the workspace's user groups with their handle, name and the member count Slack gives, and the people in each, kept only for an enabled user group that isn't one of Slack's automatic admin and owner groups and only up to 5,000, so that dropping every one of them for others stays within one mutation's writes, each membership it drops and each change to whether a user group keeps members going into Groups' transition log with its instant, and the workspace's custom emoji with their image and, for an alias, the name of the emoji it aliases, each listing forgetting the custom emoji it no longer names and noting whether the app lacked the emoji:read scope, each answer from Slack changing nothing an answer asked for later already wrote, a member count included, whichever of the listing and the members list wrote it, which the engine reads directly, scheduling analytics to follow a member whose directory entry changes and the people a user group's members change touches, having Groups reconcile a person's primary group when the directory first records them or they stop or start being a member, and the people a user group's members change or a disabled user group touches in Groups' pages, publishing memberLeft when a later directory record says a member no longer is one, and memberRejoined when one says they are one again; setting or clearing the announcement channel, which the setAnnouncementChannel command does for admins only and pickAnnouncementChannel does for a maintainer, both only where XP and levels are shown, and both republishing the admins' App Home; and the workspace's URL, an https origin Slack answers, which the website's permalinks read, with the time a request for it was claimed, so only one is pending, released when it fails and lapsing after 10 minutes; and the daily allowance, the kudos emoji and the hug budget, which the setWorkspaceSettings command saves together for the maintainer's own Slack account only, the one member the deployment's KUDOS_MAINTAINER names, while `workspace-settings` is on for them; and the Slack emoji a member may pick, the one read every emoji picker and every Slack picture of an emoji name goes through: the workspace's custom emoji first, then, where `standard-emoji`, a member decision off by default read without exposure, is on for the member who picks, Slack's standard emoji as the vendored table from iamcal/emoji-data holds them, each picked and stored only by its own name, a search finding it by any of its names, never one a custom emoji of the workspace already names, and pictured by Slack's own picture on its emoji host; an emoji name's picture reads the custom emoji, else the standard one, whoever reads it.

## entrances
- forget a member's words: a maintainer runs forgetWordsOfMember with a workspace and a Slack user ID when that member asks for their data to be deleted, so every kudos message they wrote loses its stored words and keeps a removed tombstone, and the backfill never fills the words of a kudos message they wrote, while their later kudos are stored live (AT8)
  handler: forgetWordsOfMember in convex/workspace/wordDeletion.ts
  trust: operator
  control: none — it takes only IDs, deletes only stored words, records a word-free deletion request for the member and leaves the kudos, the awards and every other row as they are; the member's later kudos are stored live as before
- forget a workspace's words: a maintainer runs forgetWordsOfWorkspace with a workspace ID when the workspace asks for its data to be deleted, so every kudos message of that workspace loses its stored words and keeps a removed tombstone, and the backfill never fills the words of a kudos message of it (AT8)
  handler: forgetWordsOfWorkspace in convex/workspace/wordDeletion.ts
  trust: operator
  control: none — it takes only an ID, deletes only that workspace's stored words, records a word-free deletion request for the workspace and leaves the kudos, the awards and every other row as they are
- pick a workspace's announcement channel: a maintainer runs pickAnnouncementChannel with a workspace ID and a channel ID, or none to clear it, when none of the workspace's admins can pick it in App Home, so the next level-up notice is posted there, or nowhere in public once cleared, and the admins' App Home is republished with it
  handler: pickAnnouncementChannel in convex/workspace/settings.ts
  trust: operator
  control: none — it takes only IDs, refuses a workspace Kudos doesn't know, saves the channel exactly as an admin's pick would, and only where XP and levels are shown in the workspace; it skips only the admin check, which a maintainer has no Slack member to pass
- set a workspace's hug budget: a maintainer runs setHugBudget with a workspace ID and a whole number, so each member there gives at most that many hugs on their day instead of 10 (SR6); the maintainer also sets it from the website's Settings, through their own Slack account
  handler: setHugBudget in convex/workspace/settings.ts
  trust: operator
  control: none — it takes only an ID and a whole number of 0 or more, refusing any other number and a workspace Kudos doesn't know, and writes only the workspace row's hugBudget

## invariants
- only admins set the announcement channel: Only a member the directory knows as a workspace admin or owner can set or clear the announcement channel from Slack; a command from anyone else, or from an admin Slack has since removed, changes nothing.
  over: setAnnouncementChannel commands from a member who isn't an admin, sent as a channel pick and as a button the member never saw, and from an admin removed by a later user_change
  via: P69: only workspace admins and owners set the announcement channel
  because: the announcement channel decides where every member's level-up notice is posted for the whole workspace (P64, P69, d-c98c9372); if any member could set it, one person could move everyone's celebrations into a channel of their choosing, and a removed admin must lose that power at once
  crossing: slack-request -> domain
  entrances: route POST /slack/interactivity
  refuted: setAnnouncementChannel no longer checked that the member is an admin -> both cases failed: the member who isn't an admin moved the next level-up notice to their channel, and so did the removed admin (2026-10-13)
  kinds: identity, state
  checklist: capability-authorization dismissed: no credential carrying bounded permission is accepted; the acting member is the one Slack names in the signed payload, and the role is read from the directory
  checklist: revalidated-permission declared as only admins set the announcement channel
  checklist: canonical-encoding dismissed: no key or digest is derived from the command
  checklist: identity-continuity dismissed: no identity succession is undertaken; a member is one Slack user in one workspace
  checklist: separation-of-duties dismissed: no approval policy applies; one admin's pick is the whole operation
  checklist: legal-state-succession dismissed: the channel is a single value that any admin may replace or clear from any prior value, with no forbidden transition
  checklist: supersession-safety dismissed: the command writes the channel in its own transaction; nothing late publishes it
  checklist: worker-fencing dismissed: no worker owns the setting
  checklist: commit-ordered-effects dismissed: the command issues no external effect; the notices that later go to the channel are posted after their own transactions commit
  checklist: resumption-coverage dismissed: no batch operation resumes
- only the maintainer changes the workspace settings: Only the maintainer's own Slack account, the member whose Slack user ID the deployment's KUDOS_MAINTAINER names, while `workspace-settings` is on for them, changes the daily allowance, the kudos emoji and the hug budget, and sees them in Settings; a workspace admin or anyone else, every member while KUDOS_MAINTAINER is unset or names someone else, and the maintainer while `workspace-settings` is off, changes nothing and sees no workspace part, and a Slack click carrying the command is no command at all.
  over: getSettings, Settings' sections and setWorkspaceSettings for the maintainer with `workspace-settings` on and off, a workspace admin who isn't the maintainer, KUDOS_MAINTAINER unset and naming another user, and a Slack click carrying setWorkspaceSettings
  via: only the maintainer changes the workspace settings
  refuted: isTheMaintainer answered true for every member, whatever KUDOS_MAINTAINER named -> 3 of 5 tests failed: the workspace admin saw the workspace part, so did every member with KUDOS_MAINTAINER unset, and a save by a member KUDOS_MAINTAINER doesn't name answered set (2026-10-17)
  because: the three settings change what every member of the workspace can give and what counts as a kudos, at once and for today too; the product owner chose that only his own account may change them (2026-10-17), so a workspace admin, who already sets the announcement channel, must not, and a deployment that names nobody must leave every member out; a flag is a rollout switch, so the maintainer is checked before `workspace-settings` is decided, only the maintainer is ever exposed to it, and widening it never hands the power to anyone else
  crossing: browser -> domain
  entrances: mutation setWorkspaceSettings
  kinds: identity, state
  checklist: capability-authorization dismissed: no credential carrying bounded permission is accepted; the acting member is the one the live session names, and the right is read from the deployment's configuration on every save
  checklist: revalidated-permission declared as only the maintainer changes the workspace settings
  checklist: canonical-encoding dismissed: the maintainer is matched by the Slack user ID exactly as the directory stores it
  checklist: identity-continuity dismissed: no identity succession is undertaken; a member is one Slack user in one workspace
  checklist: separation-of-duties dismissed: no approval policy applies; the maintainer's save is the whole operation
  checklist: legal-state-succession dismissed: each setting is a single value the maintainer may replace from any prior value within its bounds
  checklist: supersession-safety dismissed: a save writes all three settings in its own transaction; nothing late publishes them
  checklist: worker-fencing dismissed: no worker owns the settings
  checklist: commit-ordered-effects dismissed: the save issues no external effect; kudos and hugs read the settings when they are counted
  checklist: resumption-coverage dismissed: no batch operation resumes
- a workspace settings save stays in bounds: A save keeps the daily allowance a whole number from 1 to 20, the hug budget a whole number from 0 to 50 and the kudos emoji one emoji's name, trimmed, lowercased and without its colons, with no skin tone; any other value is refused with the setting it names and writes nothing.
  over: setWorkspaceSettings with an allowance of 0, 21 and 2.5, a hug budget of -1, 51 and 1.5, an emoji that is empty, holds a space or carries a skin tone, and the edges 1 and 20, 0 and 50
  via: a workspace settings save stays in bounds
  refuted: isWithin no longer required a whole number -> 2 of 10 tests failed: an allowance of 2.5 and a hug budget of 1.5 were saved (2026-10-17)
  because: an allowance of 0 or a fraction would leave members unable to give or give part of a kudos, a large one or a large hug budget grows what one kudos message or one day's hugs reads and writes, and an emoji name the parser can never match turns every kudos into ordinary chat
  kinds: state, budget
  checklist: revalidated-permission dismissed: who may save is only the maintainer changes the workspace settings; this bullet bounds the values a permitted save writes
  checklist: separation-of-duties dismissed: no approval policy applies; one save is the whole operation
  checklist: legal-state-succession dismissed: any value inside the bounds may replace any other; only values outside them are refused
  checklist: supersession-safety dismissed: a save checks and writes in one transaction; nothing late publishes it
  checklist: worker-fencing dismissed: no worker owns the settings
  checklist: commit-ordered-effects dismissed: the save issues no external effect
  checklist: resumption-coverage dismissed: no batch operation resumes
  checklist: bounded-admission declared as a workspace settings save stays in bounds
  checklist: fair-admission dismissed: the bounds apply alike to every member of the workspace; no member's share depends on another's
  checklist: rate-budget dismissed: the allowance and the hug budget are per member per day already; this bullet only caps how high the maintainer may set them
  checklist: memory-budget declared as a workspace settings save stays in bounds
  checklist: execution-budget declared as a workspace settings save stays in bounds
  checklist: circuit-breaker-policy dismissed: no dependency is called; the save is a database write
