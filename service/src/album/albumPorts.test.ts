// The ports' website seam: a call the route table doesn't register throws its former path's stub, and one it registers
// goes to that route through the app, its failures and refusals reaching the test as themselves. The table here holds
// one stand-in route of a former path, as S16's list will.
import { describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { NotPortedError } from "../notPorted.ts";
import { formerConvexCall, registry } from "./albumPorts.testing.ts";

vi.mock("../website/api/table.ts", async () => {
  const [{ memberRead }, { z }] = await Promise.all([import("../website/api/route.ts"), import("zod")]);
  return { websiteRoutes: [memberRead("website.album.getAlbumPerson", { person: z.string() }, async () => ({ kind: "found" }))] };
});

const startBackend = useTestBackend({ registry });

async function failureOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    (answer) => ({ answered: answer }),
    (error: unknown) => error,
  );
}

describe("a ported test's website call", () => {
  test("throws its former path's stub while no route of that name is registered", async () => {
    const t = startBackend();

    const failure = await failureOf(formerConvexCall(t, "website.album.getAlbum", null));

    expect(failure).toBeInstanceOf(NotPortedError);
    expect((failure as NotPortedError).path).toBe("website.album.getAlbum");
  });

  test("goes to the registered route through the app, and a stub that route reaches is thrown as itself", async () => {
    const t = startBackend();

    const failure = await failureOf(formerConvexCall(t, "website.album.getAlbumPerson", null, { person: "m1" }));

    // Who a request signs in as is S15's next port; until it lands, the transport's identify is that stub.
    expect(failure).toBeInstanceOf(NotPortedError);
    expect((failure as NotPortedError).path).toBe("website.memberQuery.verifiedMember");
  });

  test("refuses an argument the route's shape doesn't name with the shape's own refusal", async () => {
    const t = startBackend();

    const failure = await failureOf(formerConvexCall(t, "website.album.getAlbumPerson", null, { person: "m1", member: "m2" }));

    expect(String(failure)).toMatch(/Unrecognized key: "member"/);
  });
});
