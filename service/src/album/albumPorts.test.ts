// The ports' website seam over a route table: a name the table doesn't register throws its stub, and one it registers
// goes to that route through the app, its answer, failures and refusals reaching the test as themselves. The table here
// is the test's own, served by S15's transport with a check that admits whoever calls, so nothing in it waits on
// another stack.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestBackend } from "../../testing/backend.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { notPorted, NotPortedError } from "../notPorted.ts";
import { memberCommand, memberRead, type Route } from "../website/api/route.ts";
import { apiTransport, type MemberCheck, type SignedIn } from "../website/api/transport.ts";
import type { Verified } from "../website/memberQuery.ts";
import type { MemberId } from "../workspace/directory.ts";
import { callThroughTheTable, keepingFailures, registry } from "./albumPorts.testing.ts";

const juno: SignedIn = { workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" };
const admitted: Verified = { me: { member: "m_juno" as MemberId, ...juno }, person: { kind: "member", member: "m_juno" } as unknown as HomeMember };
const admitsAnyone: MemberCheck = { read: async () => admitted, command: async () => admitted };

const table: readonly Route[] = [
  memberRead("website.test.greeting", { shout: z.boolean() }, async (_ctx, me, { shout }) => ({ words: shout ? `HELLO ${me.user}` : `hello ${me.user}` })),
  memberCommand("website.test.stub", { at: z.number() }, async (_ctx, _me, _person, { at }) => {
    throw notPorted(`website.test.notYet${at}`);
  }),
  memberCommand("website.test.defect", { at: z.number() }, async (_ctx, _me, _person, { at }) => {
    throw new Error(`defect ${at}`);
  }),
];

const startBackend = useTestBackend({
  // First, before the service's own transport, which answers every other `/api/*` name with 404.
  registry: { ...registry, routes: [keepingFailures(({ operations, log }) => apiTransport({ operations, log, routes: table, identify: async () => juno, check: admitsAnyone })), ...registry.routes] },
});

async function outcomeOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    (answered) => ({ answered }),
    (failed: unknown) => ({ failed }),
  );
}

describe("a ported test's website call over a route table", () => {
  test("throws the name's stub while the table registers no route of that name", async () => {
    const t = startBackend();

    const { failed } = (await outcomeOf(callThroughTheTable(t, table, "website.album.getAlbum", null))) as { failed: NotPortedError };

    expect(failed).toBeInstanceOf(NotPortedError);
    expect(failed.path).toBe("website.album.getAlbum");
  });

  test("answers what the registered route answers through the app", async () => {
    const t = startBackend();

    expect(await callThroughTheTable(t, table, "website.test.greeting", null, { shout: true })).toEqual({ words: "HELLO U_JUNO" });
  });

  test("throws a stub the route reaches as itself, and any other failure as itself, each to its own call when made at once", async () => {
    const t = startBackend();
    const ats = Array.from({ length: 10 }, (_, n) => n);

    const outcomes = await Promise.all(ats.flatMap((at) => [outcomeOf(callThroughTheTable(t, table, "website.test.stub", null, { at })), outcomeOf(callThroughTheTable(t, table, "website.test.defect", null, { at }))]));

    const seen = outcomes.map((outcome) => {
      const { failed } = outcome as { failed: Error };
      return failed instanceof NotPortedError ? `stub ${failed.path}` : `other ${failed.message}`;
    });
    expect(seen).toEqual(ats.flatMap((at) => [`stub website.test.notYet${at}`, `other defect ${at}`]));
  });

  test("refuses an argument the route's shape doesn't name with the shape's own refusal", async () => {
    const t = startBackend();

    const { failed } = (await outcomeOf(callThroughTheTable(t, table, "website.test.greeting", null, { shout: true, member: "m2" }))) as { failed: Error };

    expect(failed.message).toMatch(/Unrecognized key: "member"/);
  });
});
