// convex/album/packs.test.ts on the service: a kudos posted through the signed front door earns its giver thoughtful
// packs, read back through the website's album. albumPorts.testing.ts says where a Slack event or a website call
// stands in as the stub it waits on.
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { emoji, mention, messageChangedEvent, messageDeletedEvent, messageEvent, reactionEvent, section, text, type RichElement } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import type { Subscription } from "../bus/publish.ts";
import type { Registry } from "../registration.ts";
import type { MemberId } from "../workspace/directory.ts";
import { aDeploymentForWorkspace, aSignedInSession, memberOrNullOf, registry, slackEvent, switchWebsite, type Person } from "./albumPorts.testing.ts";
import { grantThoughtfulPacks, grantThoughtfulPacksJob } from "./packs.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const dana = { user: "U_DANA", name: "Dana Ferreira" };
const why = "Thanks for untangling the flaky migration";

const theGrants = { holding: false, held: [] as KudosGivenEvent[] };

// The grant's bus subscription, held while a test collects its events to run them itself, as the Convex test's mock of
// the bus did.
function withHeldGrants(base: Registry): Registry {
  const subscribers = new Map(base.subscribers);
  subscribers.set(
    "kudosGiven",
    (base.subscribers.get("kudosGiven") ?? []).map((subscription): Subscription =>
      subscription.job !== grantThoughtfulPacksJob
        ? subscription
        : {
            ...subscription,
            only: (event) => {
              if (theGrants.holding) theGrants.held.push(event as unknown as KudosGivenEvent);
              return !theGrants.holding;
            },
          },
    ),
  );
  return { ...base, subscribers };
}

const backend = useTestBackend({ now: tuesday.getTime(), registry: withHeldGrants(registry) });
let t: TestBackend;
let messages = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The Convex file's beforeEach, run inside each test so a stub it reaches is the test's own NotPortedError.
async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  for (const person of [alice, bob, carol, dana]) t.slack.withMember(person.user, { real_name: person.name });
  theGrants.holding = false;
  theGrants.held = [];
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(t, true, "album");
}

describe("a pack is earned once per giver, person and week", () => {
  waitsOn(["S4", "S15", "S16"], "a kudos to three people earns its giver one waiting pack for each, oldest first", async () => {
    await setUp();
    await thanks(alice, why, bob, carol, dana);

    expect(await packsOf(alice)).toEqual([bob.name, carol.name, dana.name]);
    expect(await packsOf(bob)).toEqual([]);
  });

  waitsOn(["S4", "S15", "S16"], "HH7: a short kudos earns a pack like any kudos, and the same Slack event delivered twice earns it once", async () => {
    await setUp();
    const ts = nextTs();
    const plainKudos = [section(text("ty "), mention(bob.user), emoji("taco"))];

    await post(plainKudos, { user: alice.user, ts });
    await post(plainKudos, { user: alice.user, ts });
    await t.settle();

    expect(await packsOf(alice)).toEqual([bob.name]);
  });

  waitsOn(["S4", "S15", "S16"], "a second kudos to one of them that week, short or not, and a hug earn none", async () => {
    await setUp();
    const first = await thanks(alice, why, bob, carol, dana);
    await thanks(alice, "Thanks again for pairing on the rollback", bob);
    await thanks(alice, "ty", carol);
    await hugs(carol, alice, first);

    expect(await packsOf(alice)).toEqual([bob.name, carol.name, dana.name]);
    expect(await packsOf(carol)).toEqual([]);
  });

  waitsOn(["S4", "S15", "S16"], "a giver earns one more pack for the same person the next week", async () => {
    await setUp();
    await thanks(alice, why, bob);
    t.time.advance(7 * dayMs);
    await thanks(alice, "Thanks for reviewing the quarterly runbook", bob);

    expect(await packsOf(alice)).toEqual([bob.name, bob.name]);
  });

  waitsOn(["S4", "S15", "S16"], "a redelivered kudosGiven and two grants run in reverse order earn each pack once", async () => {
    await setUp();
    const [first, second] = await heldGrantsOf(async () => {
      await thanks(alice, why, bob, carol);
      await thanks(alice, "Thanks for writing up the incident timeline", carol, dana);
    });

    await grant(second!);
    await grant(first!);
    await grant(second!);
    await grant(first!);
    await t.settle();

    expect((await packsOf(alice)).toSorted()).toEqual([bob.name, carol.name, dana.name]);
  });

  waitsOn(["S4", "S15", "S16"], "an edit and a deletion of the kudos message never take a pack back", async () => {
    await setUp();
    const ts = nextTs();
    await post([section(text(`${why} `), mention(bob.user), emoji("taco"))], { user: alice.user, ts });
    await t.settle();
    await slackEvent(t, messageChangedEvent([section(text("ty "), mention(bob.user), emoji("taco"))], { user: alice.user, ts, editedTs: nextTs() }));
    await t.settle();
    await slackEvent(t, messageDeletedEvent({ user: alice.user, ts }));
    await t.settle();

    expect(await packsOf(alice)).toEqual([bob.name]);
  });
});

describe("AL4 AL5: each grant records its outcome", () => {
  waitsOn(["S4"], "a first pack holds the person's sticker, a later week's pack finds it waiting, one for someone already in the album finds them held, and a second in a week makes none", async () => {
    await setUp();
    await thanks(alice, why, bob);
    await thanks(alice, "Thanks again for pairing on the rollback", bob);
    t.time.advance(7 * dayMs);
    await thanks(alice, "Thanks for reviewing the quarterly runbook", bob);
    await thanks(dana, "ty", carol);
    await anAlbumStickerAsHistoryWillRecordIt(alice, carol);
    await thanks(alice, "Thanks for the steady hand during the outage", carol);

    expect(await grantOutcomesOf(alice)).toEqual([
      [bob.name, "new"],
      [bob.name, "nextWeek"],
      [bob.name, "waiting"],
      [carol.name, "held"],
    ]);
  });
});

describe("a message's packs are told once", () => {
  waitsOn(["S4"], "a kudos to three people sends one packs earned with packs_earned 3, and a second to one of them, short or not, one each with 0 and recipients 1", async () => {
    await setUp();
    await thanks(alice, why, bob, carol, dana);
    await thanks(alice, "Thanks again for pairing on the rollback", bob);
    await thanks(alice, "ty", carol);

    expect(packsEarnedEvents()).toEqual([
      { packs_earned: 3, recipients: 3 },
      { packs_earned: 0, recipients: 1 },
      { packs_earned: 0, recipients: 1 },
    ]);
  }, 30_000);

  waitsOn(["S4", "S15", "S16"], "a message to 120 people pages its grants and is told once, after its last page, also when its last page runs again", async () => {
    await setUp();
    const crowd = Array.from({ length: 120 }, (_, index) => ({ user: `U_CROWD_${index}`, name: `Crowd Person ${index}` }));
    for (const person of crowd) t.slack.withMember(person.user, { real_name: person.name });
    await thanks(alice, why, bob);
    const [event] = await heldGrantsOf(() => thanks(alice, why, bob, ...crowd));

    await t.run((ctx) => grantThoughtfulPacks(ctx, { event: event!, from: 100 }));
    await t.settle();
    expect(packsEarnedEvents()).toEqual([{ packs_earned: 1, recipients: 1 }]);

    await grant(event!);
    await t.run((ctx) => grantThoughtfulPacks(ctx, { event: event!, from: 100 }));
    await t.settle();

    expect(packsEarnedEvents()).toEqual([
      { packs_earned: 1, recipients: 1 },
      { packs_earned: 120, recipients: 121 },
    ]);
    const album = await (await signedIn(alice)).getAlbum();
    expect(album).toMatchObject({ kind: "album", morePacks: true });
    const shown = "packs" in album ? album.packs.map(({ person }) => person) : [];
    expect(shown).toHaveLength(50);
    expect(shown[0]).toBe(await memberOf(bob));
    expect(new Set(shown).size).toBe(50);
  }, 30_000);
});

function nextTs() {
  messages += 1;
  t.time.advance(minuteMs);
  return `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
}

function post(blocks: RichElement[], options: { user: string; ts: string }) {
  return slackEvent(t, messageEvent(blocks, options));
}

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  const ts = nextTs();
  await post([section(text(`${words} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts });
  await t.settle();
  return ts;
}

async function hugs(giver: Person, author: Person, ts: string) {
  await slackEvent(t, reactionEvent({ user: giver.user, itemUser: author.user, ts, eventId: `EvHug${nextTs()}` }));
  await t.settle();
}

async function heldGrantsOf(give: () => Promise<unknown>): Promise<KudosGivenEvent[]> {
  theGrants.holding = true;
  await give();
  theGrants.holding = false;
  return theGrants.held.splice(0);
}

async function grant(event: KudosGivenEvent) {
  await t.run((ctx) => grantThoughtfulPacks(ctx, { event }));
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

async function memberOf(person: Person): Promise<MemberId> {
  return (await memberOrNullOf(t, person))!;
}

async function packsOf(person: Person) {
  const album = await (await signedIn(person)).getAlbum();
  if (!("packs" in album)) throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  const names = new Map<string, string>();
  for (const someone of [alice, bob, carol, dana]) names.set((await memberOrNullOf(t, someone)) ?? someone.user, someone.name);
  return album.packs.map(({ person: packed }) => names.get(packed) ?? packed);
}

async function anAlbumStickerAsHistoryWillRecordIt(member: Person, person: Person) {
  const [memberId, personId] = [await memberOf(member), await memberOf(person)];
  await t.seed.insert("albumStickers", { member: memberId, person: personId, from: "history", at: t.clock.now() });
}

async function grantOutcomesOf(giver: Person) {
  const member = await memberOf(giver);
  const names = new Map<string, string>();
  for (const someone of [alice, bob, carol, dana]) names.set((await memberOrNullOf(t, someone)) ?? someone.user, someone.name);
  const records = (await t.seed.all("grantRecords")).filter((record) => record.giver === member);
  return records.map(({ recipient, outcome }) => [names.get(recipient), outcome]);
}

function packsEarnedEvents() {
  return t.postHog
    .productEvents()
    .filter(({ event }) => event === "packs earned")
    .map(({ properties }) => ({ packs_earned: properties.packs_earned, recipients: properties.recipients }));
}
