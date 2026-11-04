import { internalMutation } from "../_generated/server";
import { medalUnlockedEventValidator } from "../bus/events";
import { isMember } from "../workspace/directory";
import { recordReward } from "./progression";

export const payMedalUnlocked = internalMutation({
  args: { event: medalUnlockedEventValidator },
  handler: async (ctx, { event: { workspace, member, xp, rewardKey, catalogueVersion, at } }) => {
    if (!(await isMember(ctx, member))) return;
    await recordReward(ctx, workspace, { member, key: rewardKey, xp, coins: 0, item: null, catalogueVersion, at });
  },
});
