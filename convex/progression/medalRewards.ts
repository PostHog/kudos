import { internalMutation } from "../_generated/server";
import { medalsUnlockedEventValidator } from "../bus/events";
import { isMember } from "../workspace/directory";
import { recordReward } from "./progression";

export const payMedalsUnlocked = internalMutation({
  args: { event: medalsUnlockedEventValidator },
  handler: async (ctx, { event: { workspace, member, medals, catalogueVersion, at } }) => {
    if (!(await isMember(ctx, member))) return;
    for (const { xp, rewardKey } of medals) await recordReward(ctx, workspace, { member, key: rewardKey, xp, coins: 0, item: null, catalogueVersion, at });
  },
});
